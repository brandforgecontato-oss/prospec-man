import { and, asc, eq, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { jobs, type JobType } from "@/db/schema";

import type { WorkerConfig } from "./config";

export interface EnqueueJobInput {
  type: JobType;
  payload: unknown;
  idempotencyKey: string;
  leadId?: number;
  scheduledFor?: Date;
}

/** Inserts a job, or returns the id of the existing job with the same idempotency key. */
export function enqueueJob(input: EnqueueJobInput): number {
  const existing = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.idempotencyKey, input.idempotencyKey))
    .get();
  if (existing) return existing.id;

  const created = db
    .insert(jobs)
    .values({
      type: input.type,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      leadId: input.leadId,
      scheduledFor: (input.scheduledFor ?? new Date()).toISOString(),
    })
    .returning({ id: jobs.id })
    .get();
  return created.id;
}

export interface ClaimedJob {
  id: number;
  type: JobType;
  payload: unknown;
  leadId: number | null;
  attempts: number;
}

/** Atomically claims the oldest due pending job, marking it as running. */
export function claimNextJob(now: Date = new Date()): ClaimedJob | undefined {
  const nowIso = now.toISOString();

  return db.transaction((tx) => {
    const candidate = tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.status, "pending"), lte(jobs.scheduledFor, nowIso)))
      .orderBy(asc(jobs.scheduledFor))
      .limit(1)
      .get();
    if (!candidate) return undefined;

    const claimed = tx
      .update(jobs)
      .set({ status: "running", attempts: sql`${jobs.attempts} + 1`, updatedAt: nowIso })
      .where(and(eq(jobs.id, candidate.id), eq(jobs.status, "pending")))
      .returning()
      .get();
    if (!claimed) return undefined;

    return {
      id: claimed.id,
      type: claimed.type,
      payload: claimed.payload,
      leadId: claimed.leadId,
      attempts: claimed.attempts,
    };
  });
}

/**
 * Recovers jobs stuck in "running" from a worker that crashed mid-job
 * (prompt.MD critério de aceite 15, "recuperação correta após reinício").
 * Safe to call at startup because this system runs a single worker
 * process: if we're starting up, any "running" row wasn't claimed by us,
 * so it must be an orphan left behind by a previous instance. Returns how
 * many were requeued, for the startup log.
 */
export function requeueOrphanedJobs(now: Date = new Date()): number {
  const result = db
    .update(jobs)
    .set({ status: "pending", updatedAt: now.toISOString() })
    .where(eq(jobs.status, "running"))
    .run();
  return result.changes;
}

export function completeJob(id: number): void {
  db.update(jobs)
    .set({ status: "completed", lastError: null, updatedAt: new Date().toISOString() })
    .where(eq(jobs.id, id))
    .run();
}

/**
 * Pushes a job back to pending at `scheduledFor` without counting it as a
 * failure (attempts/lastError untouched). Used when a handler defers on
 * purpose — outside operating hours, daily DM cap reached, DM pacing window
 * not elapsed — as opposed to `failJob`, which is for actual errors.
 */
export function rescheduleJob(id: number, scheduledFor: Date): void {
  db.update(jobs)
    .set({ status: "pending", scheduledFor: scheduledFor.toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(jobs.id, id))
    .run();
}

/** Exponential backoff with full jitter in the top half of the window, capped at backoffMaxMs. */
export function computeBackoffMs(attempts: number, baseMs: number, maxMs: number): number {
  const exponential = baseMs * 2 ** Math.max(0, attempts - 1);
  const capped = Math.min(exponential, maxMs);
  const jitter = capped * (0.5 + Math.random() * 0.5);
  return Math.round(jitter);
}

type BackoffOptions = Pick<WorkerConfig, "maxAttempts" | "backoffBaseMs" | "backoffMaxMs">;

/** Reschedules a job with backoff, or moves it to dead_letter once maxAttempts is reached. */
export function failJob(
  id: number,
  attempts: number,
  error: unknown,
  options: BackoffOptions,
): "dead_letter" | "pending" {
  const message = error instanceof Error ? error.message : String(error);
  const now = new Date();

  if (attempts >= options.maxAttempts) {
    db.update(jobs)
      .set({ status: "dead_letter", lastError: message, updatedAt: now.toISOString() })
      .where(eq(jobs.id, id))
      .run();
    return "dead_letter";
  }

  const delayMs = computeBackoffMs(attempts, options.backoffBaseMs, options.backoffMaxMs);
  const scheduledFor = new Date(now.getTime() + delayMs);

  db.update(jobs)
    .set({
      status: "pending",
      lastError: message,
      scheduledFor: scheduledFor.toISOString(),
      updatedAt: now.toISOString(),
    })
    .where(eq(jobs.id, id))
    .run();
  return "pending";
}
