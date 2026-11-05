import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  LEAD_PIPELINE_STAGES,
  experimentAssignments,
  leads,
  type LeadPipelineStage,
} from "@/db/schema";

import type { VariantStats } from "./weights";

const STAGE_RANK = new Map(LEAD_PIPELINE_STAGES.map((stage, index) => [stage, index]));

export interface VariantMetrics {
  key: string;
  isControl: boolean;
  sampleSize: number;
  /** How many assigned leads have reached at least this pipeline stage — read from `leads.pipelineStage`, which only ever moves forward. */
  conversionsByMilestone: Record<LeadPipelineStage, number>;
}

/**
 * Reads every lead assigned to `experimentId` and, per variant, counts how
 * many reached each pipeline milestone. A lead's current `pipelineStage`
 * doubles as "reached at least this stage" because the pipeline never
 * regresses (see channel-lock.ts / CLAUDE.md), so this needs no event-log
 * replay — one join is enough.
 */
export function computeVariantMetrics(experimentId: number): VariantMetrics[] {
  const rows = db
    .select({
      variant: experimentAssignments.variant,
      isControl: experimentAssignments.isControl,
      pipelineStage: leads.pipelineStage,
    })
    .from(experimentAssignments)
    .innerJoin(leads, eq(leads.id, experimentAssignments.leadId))
    .where(eq(experimentAssignments.experimentId, experimentId))
    .all();

  const byVariant = new Map<
    string,
    { isControl: boolean; sampleSize: number; stageCounts: Map<LeadPipelineStage, number> }
  >();
  for (const row of rows) {
    const bucket = byVariant.get(row.variant) ?? {
      isControl: row.isControl,
      sampleSize: 0,
      stageCounts: new Map<LeadPipelineStage, number>(),
    };
    bucket.sampleSize += 1;
    bucket.stageCounts.set(row.pipelineStage, (bucket.stageCounts.get(row.pipelineStage) ?? 0) + 1);
    byVariant.set(row.variant, bucket);
  }

  return [...byVariant.entries()].map(([key, bucket]) => {
    const conversionsByMilestone = {} as Record<LeadPipelineStage, number>;
    for (const milestone of LEAD_PIPELINE_STAGES) {
      const milestoneRank = STAGE_RANK.get(milestone) ?? 0;
      let count = 0;
      for (const [stage, n] of bucket.stageCounts) {
        if ((STAGE_RANK.get(stage) ?? 0) >= milestoneRank) count += n;
      }
      conversionsByMilestone[milestone] = count;
    }
    return { key, isControl: bucket.isControl, sampleSize: bucket.sampleSize, conversionsByMilestone };
  });
}

export function variantStatsForMilestone(
  metrics: VariantMetrics[],
  milestone: LeadPipelineStage,
): VariantStats[] {
  return metrics.map((m) => ({
    key: m.key,
    sampleSize: m.sampleSize,
    conversions: m.conversionsByMilestone[milestone] ?? 0,
  }));
}
