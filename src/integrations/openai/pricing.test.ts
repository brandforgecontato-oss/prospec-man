import { describe, expect, it } from "vitest";

import { estimateCostMicros, resetPricingCacheForTests } from "./pricing";

describe("estimateCostMicros", () => {
  it("converts token usage into micro-USD using the configured per-model rate", () => {
    resetPricingCacheForTests({ "gpt-test": { promptPerMillionUsd: 2, completionPerMillionUsd: 8 } });

    // 500k prompt tokens @ $2/M = $1.00; 250k completion tokens @ $8/M = $2.00 → $3.00 = 3_000_000 micro-USD.
    expect(estimateCostMicros("gpt-test", 500_000, 250_000)).toBe(3_000_000);
  });

  it("throws for a model with no configured price instead of guessing a cost", () => {
    resetPricingCacheForTests({});

    expect(() => estimateCostMicros("unpriced-model", 100, 100)).toThrow(/Preço não configurado/);
  });
});
