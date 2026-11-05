import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { jobs } from "@/db/schema";

import { pauseSystem } from "./circuit-breaker";

/**
 * "Pausa automática diante de... crescimento anormal de erro" (prompt.MD).
 * Called after a job lands in dead_letter (see worker/run.ts): counts how
 * many jobs went dead_letter within `windowMs`, and trips the breaker once
 * that count reaches `threshold` — a real crash loop (bad deploy, broken
 * credential, Instagram blocking the account) produces a burst like this;
 * ordinary, spread-out failures don't.
 */
export function checkErrorRateAndMaybePause(
  threshold: number,
  windowMs: number,
  now: Date = new Date(),
): void {
  const since = new Date(now.getTime() - windowMs).toISOString();
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(jobs)
    .where(and(eq(jobs.status, "dead_letter"), gte(jobs.updatedAt, since)))
    .get();
  const count = row?.count ?? 0;

  if (count >= threshold) {
    pauseSystem(
      `Taxa de erro anormal: ${count} job(s) em dead-letter nos últimos ${Math.round(windowMs / 60_000)} min`,
    );
  }
}
