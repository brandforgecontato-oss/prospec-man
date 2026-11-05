import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  events,
  experimentAssignments,
  experiments,
  type Experiment,
  type LeadPipelineStage,
} from "@/db/schema";

import { computeVariantMetrics, variantStatsForMilestone } from "./metrics";
import type { ExperimentVariant } from "./types";
import { rampWeights } from "./weights";

export interface VariantAssignment {
  variant: string;
  isControl: boolean;
}

function parseVariants(experiment: Experiment): ExperimentVariant[] {
  return experiment.variants as ExperimentVariant[];
}

function pickWeighted(variants: ExperimentVariant[]): ExperimentVariant {
  const total = variants.reduce((sum, v) => sum + v.weight, 0);
  let roll = Math.random() * total;
  for (const variant of variants) {
    roll -= variant.weight;
    if (roll <= 0) return variant;
  }
  return variants[variants.length - 1];
}

/**
 * Assigns `leadId` to a variant of the running experiment for `variable`
 * (prompt.MD "uma variável por vez" — if more than one is running for the
 * same variable, the oldest wins). Idempotent: a lead already assigned to
 * this experiment keeps its variant. Returns null when no experiment is
 * running for that variable, so callers fall back to their default,
 * non-experimental behavior.
 *
 * Before picking, ramps the experiment's weights toward whichever side is
 * converting better on `rampMilestone` (see weights.ts) — this makes the
 * ramp a side effect of ordinary traffic instead of needing its own
 * scheduled job.
 */
export function assignVariantForVariable(
  variable: string,
  leadId: number,
  rampMilestone: LeadPipelineStage,
): VariantAssignment | null {
  const experiment = db
    .select()
    .from(experiments)
    .where(and(eq(experiments.variable, variable), eq(experiments.status, "running")))
    .orderBy(experiments.createdAt)
    .get();
  if (!experiment) return null;

  const existing = db
    .select()
    .from(experimentAssignments)
    .where(
      and(
        eq(experimentAssignments.experimentId, experiment.id),
        eq(experimentAssignments.leadId, leadId),
      ),
    )
    .get();
  if (existing) return { variant: existing.variant, isControl: existing.isControl };

  const metrics = computeVariantMetrics(experiment.id);
  const stats = variantStatsForMilestone(metrics, rampMilestone);
  const currentVariants = parseVariants(experiment);
  const rampedVariants = rampWeights(currentVariants, stats, experiment.minSampleSize);
  if (rampedVariants !== currentVariants) {
    db.update(experiments).set({ variants: rampedVariants }).where(eq(experiments.id, experiment.id)).run();
    db.insert(events)
      .values({
        leadId: null,
        type: "experiment_weights_adjusted",
        payload: { experimentId: experiment.id, milestone: rampMilestone, variants: rampedVariants },
      })
      .run();
  }

  const chosen = pickWeighted(rampedVariants);
  db.insert(experimentAssignments)
    .values({ experimentId: experiment.id, leadId, variant: chosen.key, isControl: chosen.isControl })
    .run();
  db.insert(events)
    .values({
      leadId,
      type: "experiment_variant_assigned",
      payload: { experimentId: experiment.id, variant: chosen.key, isControl: chosen.isControl },
    })
    .run();

  return { variant: chosen.key, isControl: chosen.isControl };
}
