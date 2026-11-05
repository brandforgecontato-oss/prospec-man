import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { events, leads, messages } from "@/db/schema";
import { sendApiMessage as sendViaGraphApi } from "@/integrations/instagram/client";
import { loadInstagramConfig } from "@/integrations/instagram/config";

import { tryTransitionChannelState } from "./channel-lock";

export interface SendApiMessagePayload {
  leadId: number;
  content: string;
  variant?: string;
}

function parsePayload(payload: unknown): SendApiMessagePayload {
  const data = payload as Partial<SendApiMessagePayload> | null;
  if (typeof data?.leadId !== "number" || !data.content) {
    throw new Error("send_api_message: payload.leadId/content ausente");
  }
  return { leadId: data.leadId, content: data.content, variant: data.variant };
}

/**
 * Sends one message via the official Instagram API. Who decides what to say
 * and when is the OpenAI engine (etapa 13) — this handler only owns the
 * mechanical checks prompt.MD requires before every API send: do-not-contact,
 * channel ownership (must already be `api_active`), and the 24h messaging
 * window since the lead's last inbound message.
 */
export async function sendApiMessage(payload: unknown): Promise<void> {
  const { leadId, content, variant } = parsePayload(payload);

  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) {
    throw new Error(`send_api_message: lead ${leadId} não encontrado`);
  }
  if (lead.doNotContact || lead.channelState === "do_not_contact" || lead.channelState === "blocked") {
    return;
  }
  if (lead.channelState !== "api_active" || !lead.instagramUserId) {
    // Channel ownership isn't (or is no longer) with the API — no-op, not a failure.
    return;
  }

  const instagramConfig = loadInstagramConfig();

  const lastInbound = db
    .select({ sentAt: messages.sentAt })
    .from(messages)
    .where(and(eq(messages.leadId, leadId), eq(messages.direction, "inbound")))
    .orderBy(desc(messages.sentAt))
    .limit(1)
    .get();

  const windowMs = instagramConfig.messagingWindowHours * 60 * 60_000;
  const elapsedMs = lastInbound ? Date.now() - new Date(lastInbound.sentAt as string).getTime() : Infinity;
  if (elapsedMs > windowMs) {
    // CAS from api_active: if channel ownership already moved on (e.g. the
    // operator took over) since we read `lead` above, don't stomp on it.
    if (tryTransitionChannelState(leadId, "api_active", "api_window_closed")) {
      db.insert(events)
        .values({
          leadId,
          type: "channel_state_changed",
          payload: { from: "api_active", to: "api_window_closed", by: "system", reason: "messaging window expired" },
        })
        .run();
    }
    return;
  }

  // Re-confirm ownership right before sending — the read above and this
  // point aren't atomic, so a concurrent handoff away from the API could
  // have landed in between.
  if (!tryTransitionChannelState(leadId, "api_active", "api_active")) {
    db.insert(events)
      .values({ leadId, type: "channel_lock_lost", payload: { wanted: "api_active (send)" } })
      .run();
    return;
  }

  const result = await sendViaGraphApi(instagramConfig, lead.instagramUserId, content);

  const sentAt = new Date().toISOString();
  db.insert(messages)
    .values({
      leadId,
      direction: "outbound",
      channel: "api",
      content,
      variant,
      status: "sent",
      providerMessageId: result.providerMessageId,
      sentAt,
    })
    .run();

  db.insert(events)
    .values({ leadId, type: "message_sent", payload: { channel: "api", content } })
    .run();
}
