import type { ExperimentVariant } from "./types";

export interface VariantStats {
  key: string;
  sampleSize: number;
  /** Count of leads assigned to this variant that reached the milestone being optimized for. */
  conversions: number;
}

// prompt.MD "Otimização contínua": increase gradually, never declare a winner
// early, keep everything comparable and reversible.
const WEIGHT_STEP = 5;
const CONTROL_FLOOR = 10;
const EXPLORATION_FLOOR = 10;
// Complementary to CONTROL_FLOOR (90 + 10 = 100) so a two-variant experiment
// can actually reach both bounds instead of deadlocking between them.
const MAX_VARIANT_WEIGHT = 100 - CONTROL_FLOOR;
/** Conversion-rate gap (percentage points) required before weight moves at all — avoids chasing noise. */
const MEANINGFUL_LEAD_MARGIN_PP = 10;

function conversionRatePct(stats: VariantStats | undefined): number {
  if (!stats || stats.sampleSize === 0) return 0;
  return (stats.conversions / stats.sampleSize) * 100;
}

/**
 * Nudges one experiment's variant weights toward whichever of control or the
 * leading challenger is currently converting better, one WEIGHT_STEP at a
 * time. Pure function — no DB access — so the rule is unit-testable on its
 * own; see assign.ts for the persistence side.
 *
 * Gated on every variant having `minSampleSize` assignments first ("sem
 * declarar vencedor cedo"), then on the lead being bigger than
 * MEANINGFUL_LEAD_MARGIN_PP. Moves weight only between the control and the
 * current leader, symmetrically, so the total always stays at 100 and either
 * side can win back weight later if the trend reverses.
 */
export function rampWeights(
  variants: ExperimentVariant[],
  stats: VariantStats[],
  minSampleSize: number,
): ExperimentVariant[] {
  const statsByKey = new Map(stats.map((s) => [s.key, s]));
  const fullySampled = variants.every(
    (v) => (statsByKey.get(v.key)?.sampleSize ?? 0) >= minSampleSize,
  );
  if (!fullySampled) return variants;

  const control = variants.find((v) => v.isControl);
  const challengers = variants.filter((v) => !v.isControl);
  if (!control || challengers.length === 0) return variants;

  const rate = (key: string) => conversionRatePct(statsByKey.get(key));
  const leader = challengers.reduce(
    (best, v) => (rate(v.key) > rate(best.key) ? v : best),
    challengers[0],
  );

  const delta = rate(leader.key) - rate(control.key);
  if (Math.abs(delta) < MEANINGFUL_LEAD_MARGIN_PP) return variants;

  const growing = delta > 0 ? leader : control;
  const shrinking = delta > 0 ? control : leader;
  const shrinkFloor =
    shrinking.key === control.key
      ? CONTROL_FLOOR
      : shrinking.isExploration
        ? EXPLORATION_FLOOR
        : 0;

  const growSlack = MAX_VARIANT_WEIGHT - growing.weight;
  const shrinkSlack = shrinking.weight - shrinkFloor;
  const appliedStep = Math.max(0, Math.min(WEIGHT_STEP, growSlack, shrinkSlack));
  if (appliedStep === 0) return variants;

  return variants.map((v) => {
    if (v.key === growing.key) return { ...v, weight: v.weight + appliedStep };
    if (v.key === shrinking.key) return { ...v, weight: v.weight - appliedStep };
    return v;
  });
}
