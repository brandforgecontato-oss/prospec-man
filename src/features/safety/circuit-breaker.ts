import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { events, systemState } from "@/db/schema";

const ROW_ID = 1;

/**
 * The "botão de pausa geral" / "pausa automática" from prompt.MD "Segurança
 * e confiabilidade" — a single switch, checked by the worker before it
 * claims each job (see worker/run.ts), that halts every job type at once.
 * Backed by one fixed row (id=1) in `system_state`; no seed migration
 * needed since a missing row just reads as not-paused, and writes upsert.
 * No `server-only` — the worker (standalone `tsx` process) calls this
 * directly, same reasoning as channel-lock.ts.
 */
export interface SystemState {
  paused: boolean;
  pausedReason: string | null;
  pausedAt: string | null;
}

export function getSystemState(): SystemState {
  const row = db.select().from(systemState).where(eq(systemState.id, ROW_ID)).get();
  if (!row) return { paused: false, pausedReason: null, pausedAt: null };
  return { paused: row.paused, pausedReason: row.pausedReason, pausedAt: row.pausedAt };
}

export function isSystemPaused(): boolean {
  return getSystemState().paused;
}

/**
 * Pauses the whole system. A no-op if already paused, so an automatic
 * trigger never overwrites the original reason an operator (or an earlier
 * trigger) paused for — the first cause is the one worth keeping.
 */
export function pauseSystem(reason: string): void {
  if (isSystemPaused()) return;
  const now = new Date().toISOString();
  db.insert(systemState)
    .values({ id: ROW_ID, paused: true, pausedReason: reason, pausedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: systemState.id,
      set: { paused: true, pausedReason: reason, pausedAt: now, updatedAt: now },
    })
    .run();
  // Reuses the "circuit_breaker_tripped" event type reserved since the
  // original schema (etapa 5) but unused until now — this is exactly it.
  db.insert(events).values({ leadId: null, type: "circuit_breaker_tripped", payload: { reason } }).run();
}

export function resumeSystem(): void {
  const now = new Date().toISOString();
  db.insert(systemState)
    .values({ id: ROW_ID, paused: false, pausedReason: null, pausedAt: null, updatedAt: now })
    .onConflictDoUpdate({
      target: systemState.id,
      set: { paused: false, pausedReason: null, pausedAt: null, updatedAt: now },
    })
    .run();
  db.insert(events).values({ leadId: null, type: "system_resumed", payload: {} }).run();
}
