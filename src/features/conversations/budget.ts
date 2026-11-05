import { gte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { aiCalls } from "@/db/schema";

/** First instant of the current UTC month, as an ISO string — matches `ai_calls.createdAt`. */
function currentMonthStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Sum of `ai_calls.costUsd` (micro-USD) recorded so far this UTC month. */
export function monthToDateCostMicros(now: Date = new Date()): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${aiCalls.costUsd}), 0)` })
    .from(aiCalls)
    .where(gte(aiCalls.createdAt, currentMonthStartIso(now)))
    .get();
  return row?.total ?? 0;
}

/**
 * Whether calling OpenAI again this month would exceed `OPENAI_MONTHLY_BUDGET_USD`
 * — prompt.MD: "Antes de cada chamada o worker consulta ... e pausa o sistema
 * ao atingir o teto." Checked before every call, not just once per job.
 */
export function isMonthlyBudgetExceeded(monthlyBudgetUsd: number, now: Date = new Date()): boolean {
  return monthToDateCostMicros(now) >= monthlyBudgetUsd * 1_000_000;
}
