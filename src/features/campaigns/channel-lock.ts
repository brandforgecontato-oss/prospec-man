import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { leads, type LeadChannelState, type LeadPipelineStage } from "@/db/schema";

export interface ChannelTransitionExtra {
  pipelineStage?: LeadPipelineStage;
}

/**
 * Atomically moves a lead from one of `from` states to `to` in a single SQL
 * UPDATE — the "trava de propriedade de canal" from prompt.MD. SQLite
 * serializes writers, so whichever caller's UPDATE lands first wins the
 * channel; every other caller (a concurrent job, an operator CRM action)
 * sees 0 rows changed and must treat that as having lost the race, never as
 * "retry, the old state is still there."
 */
export function tryTransitionChannelState(
  leadId: number,
  from: LeadChannelState | LeadChannelState[],
  to: LeadChannelState,
  extra: ChannelTransitionExtra = {},
): boolean {
  const fromStates = Array.isArray(from) ? from : [from];
  const result = db
    .update(leads)
    .set({ channelState: to, updatedAt: new Date().toISOString(), ...extra })
    .where(and(eq(leads.id, leadId), inArray(leads.channelState, fromStates)))
    .run();
  return result.changes > 0;
}
