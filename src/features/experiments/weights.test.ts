import { describe, expect, it } from "vitest";

import type { ExperimentVariant } from "./types";
import { rampWeights, type VariantStats } from "./weights";

function variants(): ExperimentVariant[] {
  return [
    { key: "control", label: "Controle", weight: 80, isControl: true },
    { key: "challenger", label: "Desafiante", weight: 20, isControl: false, isExploration: true },
  ];
}

describe("rampWeights", () => {
  it("leaves weights untouched when a variant has not reached the minimum sample size", () => {
    const stats: VariantStats[] = [
      { key: "control", sampleSize: 10, conversions: 8 },
      { key: "challenger", sampleSize: 29, conversions: 20 },
    ];

    expect(rampWeights(variants(), stats, 30)).toEqual(variants());
  });

  it("leaves weights untouched when the gap is within the noise margin", () => {
    const stats: VariantStats[] = [
      { key: "control", sampleSize: 100, conversions: 30 },
      { key: "challenger", sampleSize: 100, conversions: 35 },
    ];

    expect(rampWeights(variants(), stats, 30)).toEqual(variants());
  });

  it("shifts weight from control to a meaningfully ahead challenger", () => {
    const stats: VariantStats[] = [
      { key: "control", sampleSize: 100, conversions: 20 },
      { key: "challenger", sampleSize: 100, conversions: 40 },
    ];

    const result = rampWeights(variants(), stats, 30);
    expect(result.find((v) => v.key === "challenger")?.weight).toBe(25);
    expect(result.find((v) => v.key === "control")?.weight).toBe(75);
  });

  it("never shrinks control below its floor", () => {
    const nearFloor: ExperimentVariant[] = [
      { key: "control", label: "Controle", weight: 12, isControl: true },
      { key: "challenger", label: "Desafiante", weight: 88, isControl: false },
    ];
    const stats: VariantStats[] = [
      { key: "control", sampleSize: 100, conversions: 10 },
      { key: "challenger", sampleSize: 100, conversions: 50 },
    ];

    const result = rampWeights(nearFloor, stats, 30);
    const control = result.find((v) => v.key === "control")!;
    const challenger = result.find((v) => v.key === "challenger")!;
    expect(control.weight).toBe(10);
    expect(challenger.weight).toBe(90);
  });

  it("never grows a variant past the weight cap", () => {
    const nearCap: ExperimentVariant[] = [
      { key: "control", label: "Controle", weight: 14, isControl: true },
      { key: "challenger", label: "Desafiante", weight: 86, isControl: false },
    ];
    const stats: VariantStats[] = [
      { key: "control", sampleSize: 100, conversions: 5 },
      { key: "challenger", sampleSize: 100, conversions: 60 },
    ];

    const result = rampWeights(nearCap, stats, 30);
    expect(result.find((v) => v.key === "challenger")?.weight).toBe(90);
    expect(result.find((v) => v.key === "control")?.weight).toBe(10);
  });

  it("reverses direction when control regains the lead", () => {
    const challengerAhead: ExperimentVariant[] = [
      { key: "control", label: "Controle", weight: 60, isControl: true },
      { key: "challenger", label: "Desafiante", weight: 40, isControl: false },
    ];
    const stats: VariantStats[] = [
      { key: "control", sampleSize: 100, conversions: 45 },
      { key: "challenger", sampleSize: 100, conversions: 15 },
    ];

    const result = rampWeights(challengerAhead, stats, 30);
    expect(result.find((v) => v.key === "control")?.weight).toBe(65);
    expect(result.find((v) => v.key === "challenger")?.weight).toBe(35);
  });

  it("keeps weights summing to 100", () => {
    const stats: VariantStats[] = [
      { key: "control", sampleSize: 100, conversions: 20 },
      { key: "challenger", sampleSize: 100, conversions: 40 },
    ];

    const result = rampWeights(variants(), stats, 30);
    expect(result.reduce((sum, v) => sum + v.weight, 0)).toBe(100);
  });
});
