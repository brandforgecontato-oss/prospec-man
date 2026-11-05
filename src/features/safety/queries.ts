import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { type EventType, events, jobs, leads } from "@/db/schema";
import { loadBrowserConfig } from "@/integrations/browser/config";
import { loadOpenAiConfig } from "@/integrations/openai/config";
import { loadWorkerConfig } from "@/worker/config";

import { getSystemState } from "./circuit-breaker";

export { getSystemState };

export function listDeadLetterJobs() {
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.status, "dead_letter"))
    .orderBy(desc(jobs.updatedAt))
    .all();
}

export function listHumanReviewLeads() {
  return db
    .select()
    .from(leads)
    .where(eq(leads.channelState, "human_review_required"))
    .orderBy(desc(leads.updatedAt))
    .all();
}

const INTEGRATION_ALERT_TYPES: EventType[] = [
  "browser_unavailable",
  "dm_send_failed",
  "webhook_message_unmatched",
  "channel_lock_lost",
  "ai_claim_blocked",
  "circuit_breaker_tripped",
  "system_resumed",
];

export function listRecentIntegrationAlerts(limit = 20) {
  return db
    .select()
    .from(events)
    .where(inArray(events.type, INTEGRATION_ALERT_TYPES))
    .orderBy(desc(events.createdAt))
    .limit(limit)
    .all();
}

export interface OperationalLimits {
  maxDmsPerDay: number | null;
  minSecondsBetweenDms: number | null;
  maxSecondsBetweenDms: number | null;
  operatingHours: string | null;
  operatingTimezone: string | null;
  openAiMonthlyBudgetUsd: number | null;
  jobMaxAttempts: number;
  errorRateThreshold: number;
  errorRateWindowMs: number;
}

/**
 * Read-only view of the operational limits currently in effect — CRM
 * "configuração dos limites" (prompt.MD). These only ever come from `.env`
 * (CLAUDE.md convention), so there is nothing to edit here; an unset
 * integration (Chrome/OpenAI not configured yet) shows as null instead of
 * failing the whole page.
 */
export function readOperationalLimits(): OperationalLimits {
  const worker = loadWorkerConfig();

  let browser: ReturnType<typeof loadBrowserConfig> | null = null;
  try {
    browser = loadBrowserConfig();
  } catch {
    browser = null;
  }

  let openAiMonthlyBudgetUsd: number | null = null;
  try {
    openAiMonthlyBudgetUsd = loadOpenAiConfig().monthlyBudgetUsd;
  } catch {
    openAiMonthlyBudgetUsd = null;
  }

  return {
    maxDmsPerDay: browser?.maxDmsPerDay ?? null,
    minSecondsBetweenDms: browser?.minSecondsBetweenDms ?? null,
    maxSecondsBetweenDms: browser?.maxSecondsBetweenDms ?? null,
    operatingHours: browser
      ? `${browser.operatingHours.startHour}h–${browser.operatingHours.endHour}h`
      : null,
    operatingTimezone: browser?.operatingTimezone ?? null,
    openAiMonthlyBudgetUsd,
    jobMaxAttempts: worker.maxAttempts,
    errorRateThreshold: worker.errorRateThreshold,
    errorRateWindowMs: worker.errorRateWindowMs,
  };
}
