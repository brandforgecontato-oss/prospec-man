import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { events, leads, messages } from "@/db/schema";
import { loadBrowserConfig } from "@/integrations/browser/config";
import { captureFailureDiagnostics } from "@/integrations/browser/diagnostics";
import { sendDirectMessage } from "@/integrations/browser/dm";
import { BrowserUnavailableError } from "@/integrations/browser/errors";
import {
  isSameOperatingDay,
  isWithinOperatingHours,
  operatingDaysSince,
  randomDelayMsBetweenDms,
  warmupDailyLimit,
} from "@/integrations/browser/pacing";
import { withAgentPage } from "@/integrations/browser/session";
import { assignVariantForVariable } from "@/features/experiments/assign";
import { pauseSystem } from "@/features/safety/circuit-breaker";
import { getBusinessConfig } from "@/lib/business-config-core";
import { DeferJobError } from "@/worker/defer-job-error";
import type { JobContext } from "@/worker/handlers";

import { tryTransitionChannelState } from "./channel-lock";
import { buildOpeningMessage } from "./message";

/** Fast, funnel-shaped feedback signal for ramping the "opening_message" experiment — see experiments/assign.ts. */
const OPENING_MESSAGE_RAMP_MILESTONE = "replied";

export interface SendBrowserDmPayload {
  leadId: number;
}

/** How soon to recheck operating-hours/daily-cap deferrals — not a precise next-window computation, just a steady poll. */
const RECHECK_MS = 15 * 60_000;

function parsePayload(payload: unknown): SendBrowserDmPayload {
  const data = payload as Partial<SendBrowserDmPayload> | null;
  if (typeof data?.leadId !== "number") {
    throw new Error("send_browser_dm: payload.leadId ausente");
  }
  return { leadId: data.leadId };
}

function sentBrowserDms() {
  return db
    .select({ sentAt: messages.sentAt })
    .from(messages)
    .where(and(eq(messages.channel, "browser"), eq(messages.direction, "outbound"), eq(messages.status, "sent")))
    .orderBy(desc(messages.sentAt))
    .all()
    .filter((row): row is { sentAt: string } => row.sentAt !== null);
}

/**
 * Sends the first DM for a lead via the operator's browser, respecting the
 * daily cap, warmup ramp, inter-DM interval and operating hours from
 * prompt.MD "Ritmo humano". Funil A, passos 5-6.
 */
export async function sendBrowserDm(payload: unknown, context: JobContext): Promise<void> {
  const { leadId } = parsePayload(payload);
  const browserConfig = loadBrowserConfig();
  const business = getBusinessConfig();

  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) {
    throw new Error(`send_browser_dm: lead ${leadId} não encontrado`);
  }
  if (lead.doNotContact || lead.channelState === "do_not_contact" || lead.channelState === "blocked") {
    return;
  }
  if (lead.channelState !== "browser_contact_pending") {
    // Already sent, or the operator moved the lead on manually — idempotent no-op.
    return;
  }

  const now = new Date();

  if (!isWithinOperatingHours(now, browserConfig.operatingHours, browserConfig.operatingTimezone)) {
    throw new DeferJobError(new Date(now.getTime() + RECHECK_MS), "fora da janela de operação");
  }

  const sent = sentBrowserDms();
  const sentToday = sent.filter((row) =>
    isSameOperatingDay(new Date(row.sentAt), now, browserConfig.operatingTimezone),
  ).length;
  const campaignStart = sent.length > 0 ? new Date(sent[sent.length - 1].sentAt) : now;
  const daysSince = operatingDaysSince(campaignStart, now, browserConfig.operatingTimezone);
  const dailyCap = Math.min(
    browserConfig.maxDmsPerDay,
    warmupDailyLimit(daysSince, browserConfig.maxDmsPerDay),
  );
  if (sentToday >= dailyCap) {
    throw new DeferJobError(new Date(now.getTime() + RECHECK_MS), "limite diário de DMs atingido");
  }

  if (sent.length > 0) {
    const lastSentAt = new Date(sent[0].sentAt);
    const requiredGapMs = randomDelayMsBetweenDms(
      browserConfig.minSecondsBetweenDms,
      browserConfig.maxSecondsBetweenDms,
    );
    const elapsedMs = now.getTime() - lastSentAt.getTime();
    if (elapsedMs < requiredGapMs) {
      throw new DeferJobError(
        new Date(lastSentAt.getTime() + requiredGapMs),
        "aguardando intervalo mínimo entre DMs",
      );
    }
  }

  // Reserve the channel right before sending: a single CAS UPDATE, so a
  // concurrent operator CRM action or the API side of the handoff can never
  // race this into sending twice. Losing the race is a no-op, not a retry.
  const reserved = tryTransitionChannelState(lead.id, "browser_contact_pending", "browser_contact_sent");
  if (!reserved) {
    db.insert(events)
      .values({
        leadId: lead.id,
        type: "channel_lock_lost",
        payload: { jobId: context.id, wanted: "browser_contact_sent" },
      })
      .run();
    return;
  }

  const assignment = assignVariantForVariable(
    "opening_message",
    lead.id,
    OPENING_MESSAGE_RAMP_MILESTONE,
  );
  const message = buildOpeningMessage({
    fullName: lead.fullName,
    instagramUsername: lead.instagramUsername,
    bio: lead.bio,
    profileCategory: lead.profileCategory,
    icpKeywords: business.icpKeywords,
    variant: assignment?.variant,
  });

  try {
    await withAgentPage(browserConfig, async (agentPage) => {
      try {
        await sendDirectMessage(agentPage, lead.instagramUsername, message);
      } catch (error) {
        const diagnostics = await captureFailureDiagnostics({
          page: agentPage.page,
          jobId: context.id,
          consoleErrors: agentPage.consoleErrors,
          networkFailures: agentPage.networkFailures,
          error,
        });
        db.insert(events)
          .values({ leadId: lead.id, type: "dm_send_failed", payload: diagnostics })
          .run();
        throw error;
      }
    });
  } catch (error) {
    // Best-effort: release the reservation so the retry (or a fresh
    // discover_profile) can try again. If the operator moved the lead on to
    // something else meanwhile (e.g. blocked it), that wins — we only ever
    // revert the exact reservation we hold.
    tryTransitionChannelState(lead.id, "browser_contact_sent", "browser_contact_pending");
    if (error instanceof BrowserUnavailableError) {
      db.insert(events)
        .values({
          leadId: lead.id,
          type: "browser_unavailable",
          payload: { jobId: context.id, reason: error.message },
        })
        .run();
      // prompt.MD "Pausa automática diante de... perda de sessão" — a
      // missing CDP connection or logged-out context affects every browser
      // job, not just this lead's.
      pauseSystem(`Navegador indisponível: ${error.message}`);
    }
    throw error;
  }

  const sentAt = new Date().toISOString();
  db.insert(messages)
    .values({
      leadId: lead.id,
      direction: "outbound",
      channel: "browser",
      content: message,
      variant: assignment?.variant,
      status: "sent",
      sentAt,
    })
    .run();

  tryTransitionChannelState(lead.id, "browser_contact_sent", "waiting_inbound_reply", {
    pipelineStage: "contacted",
  });

  db.insert(events)
    .values([
      {
        leadId: lead.id,
        type: "message_sent",
        payload: { channel: "browser", content: message },
      },
      {
        leadId: lead.id,
        type: "pipeline_stage_changed",
        payload: { from: lead.pipelineStage, to: "contacted", by: "system" },
      },
      {
        leadId: lead.id,
        type: "channel_state_changed",
        payload: { from: "browser_contact_sent", to: "waiting_inbound_reply", by: "system" },
      },
    ])
    .run();
}
