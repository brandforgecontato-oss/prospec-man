import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { events, leads, messages } from "@/db/schema";
import { fetchProfileUsername } from "@/integrations/instagram/client";
import { loadInstagramConfig } from "@/integrations/instagram/config";
import type { InboundMessageEvent } from "@/integrations/instagram/webhook";
import { enqueueJob } from "@/worker/queue";

import { tryTransitionChannelState } from "./channel-lock";

function parsePayload(payload: unknown): InboundMessageEvent {
  const data = payload as Partial<InboundMessageEvent> | null;
  if (!data?.mid || !data.senderId || !data.recipientId || !data.text) {
    throw new Error("poll_webhook_inbox: payload incompleto");
  }
  return {
    mid: data.mid,
    senderId: data.senderId,
    recipientId: data.recipientId,
    text: data.text,
    timestamp: data.timestamp ?? Date.now(),
  };
}

/**
 * Finds the lead an inbound IGSID belongs to. The first DM went out by
 * username (browser), so a reply — which only carries the Meta-assigned
 * IGSID — has to be matched back: first by an IGSID already recorded on a
 * lead (later messages in the same thread), then by resolving the IGSID's
 * username via the Graph API and matching a lead still waiting for that
 * reply. See prompt.MD "sistema casa o ID da Meta com o lead".
 */
async function findLeadForSender(senderId: string) {
  const byIgsid = db.select().from(leads).where(eq(leads.instagramUserId, senderId)).get();
  if (byIgsid) return byIgsid;

  const username = await fetchProfileUsername(loadInstagramConfig(), senderId);
  if (!username) return undefined;

  const candidate = db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.instagramUsername, username),
        eq(leads.channelState, "waiting_inbound_reply"),
      ),
    )
    .get();
  if (!candidate) return undefined;

  db.update(leads)
    .set({ instagramUserId: senderId, updatedAt: new Date().toISOString() })
    .where(eq(leads.id, candidate.id))
    .run();
  return candidate;
}

/**
 * Processes one inbound Instagram message delivered by the webhook: matches
 * it to a lead, records it, and hands channel ownership from the browser to
 * the official API — "propriedade do canal passa para a API" in prompt.MD.
 * Deciding *what* to reply is the OpenAI engine (etapa 13); this step only
 * does the handoff and bookkeeping.
 */
export async function pollWebhookInbox(payload: unknown): Promise<void> {
  const event = parsePayload(payload);

  const alreadyRecorded = db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.providerMessageId, event.mid))
    .get();
  if (alreadyRecorded) return;

  const lead = await findLeadForSender(event.senderId);
  if (!lead) {
    db.insert(events)
      .values({
        type: "webhook_message_unmatched",
        payload: { senderId: event.senderId, mid: event.mid },
      })
      .run();
    return;
  }

  const receivedAt = new Date(event.timestamp).toISOString();
  db.insert(messages)
    .values({
      leadId: lead.id,
      direction: "inbound",
      channel: "api",
      content: event.text,
      status: "delivered",
      providerMessageId: event.mid,
      sentAt: receivedAt,
    })
    .run();

  const nextPipelineStage = lead.pipelineStage === "contacted" ? "replied" : lead.pipelineStage;
  const wantsHandoff = lead.channelState === "waiting_inbound_reply" || lead.channelState === "browser_contact_sent";
  const pipelineStageChanged = nextPipelineStage !== lead.pipelineStage;

  let channelStateChanged = false;
  if (wantsHandoff) {
    // CAS the channel handoff — "propriedade do canal passa para a API" — so a
    // send_browser_dm reservation in flight for this lead can't win after the
    // reply has already arrived. Losing the race just skips the handoff; the
    // pipeline stage still advances below.
    channelStateChanged = tryTransitionChannelState(
      lead.id,
      lead.channelState,
      "api_active",
      pipelineStageChanged ? { pipelineStage: nextPipelineStage } : {},
    );
    if (!channelStateChanged) {
      db.insert(events)
        .values({ leadId: lead.id, type: "channel_lock_lost", payload: { mid: event.mid, wanted: "api_active" } })
        .run();
    }
  }
  if (pipelineStageChanged && !channelStateChanged) {
    db.update(leads)
      .set({ pipelineStage: nextPipelineStage, updatedAt: receivedAt })
      .where(eq(leads.id, lead.id))
      .run();
  }

  const eventsToInsert: (typeof events.$inferInsert)[] = [
    { leadId: lead.id, type: "message_received", payload: { channel: "api", content: event.text } },
  ];
  if (pipelineStageChanged) {
    eventsToInsert.push({
      leadId: lead.id,
      type: "pipeline_stage_changed",
      payload: { from: lead.pipelineStage, to: nextPipelineStage, by: "system" },
    });
  }
  if (channelStateChanged) {
    eventsToInsert.push({
      leadId: lead.id,
      type: "channel_state_changed",
      payload: { from: lead.channelState, to: "api_active", by: "system" },
    });
  }
  db.insert(events).values(eventsToInsert).run();

  // Deciding what (if anything) to reply is the OpenAI engine (etapa 13) —
  // only chained when channel ownership actually sits with the API.
  const resultingChannelState = channelStateChanged ? "api_active" : lead.channelState;
  if (resultingChannelState === "api_active") {
    enqueueJob({
      type: "decide_and_reply",
      payload: { leadId: lead.id, latestInboundMessage: event.text },
      idempotencyKey: `decide_and_reply:${event.mid}`,
      leadId: lead.id,
    });
  }
}
