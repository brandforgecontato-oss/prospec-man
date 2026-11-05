import "server-only";

import { desc } from "drizzle-orm";

import { db } from "@/db/client";
import { LEAD_PIPELINE_STAGES, experiments, type Experiment } from "@/db/schema";

import { computeVariantMetrics, type VariantMetrics } from "./metrics";
import type { ExperimentVariant } from "./types";

export interface ExperimentWithMetrics {
  experiment: Experiment;
  variants: ExperimentVariant[];
  metrics: VariantMetrics[];
}

/** Milestones worth showing per variant — the full pipeline is too dense for a comparison table. */
export const REPORTED_MILESTONES = LEAD_PIPELINE_STAGES.filter((stage) =>
  (["contacted", "replied", "interested", "registered", "active_customer"] as const).includes(
    stage as never,
  ),
);

export function listExperimentsWithMetrics(): ExperimentWithMetrics[] {
  const rows = db.select().from(experiments).orderBy(desc(experiments.createdAt)).all();
  return rows.map((experiment) => ({
    experiment,
    variants: experiment.variants as ExperimentVariant[],
    metrics: computeVariantMetrics(experiment.id),
  }));
}
