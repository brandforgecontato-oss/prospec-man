import { readFileSync } from "node:fs";
import path from "node:path";

interface ModelPricing {
  promptPerMillionUsd: number;
  completionPerMillionUsd: number;
}

interface PricingFile {
  models: Record<string, ModelPricing>;
}

let cachedPricing: Record<string, ModelPricing> | undefined;

function loadPricingTable(): Record<string, ModelPricing> {
  if (!cachedPricing) {
    const filePath = path.join(process.cwd(), "config", "openai-pricing.json");
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as PricingFile;
    cachedPricing = parsed.models;
  }
  return cachedPricing;
}

/** Test-only: forces the next read to reload the file (or an injected table). */
export function resetPricingCacheForTests(table?: Record<string, ModelPricing>): void {
  cachedPricing = table;
}

/**
 * Converts token usage into an estimated cost in micro-USD (1 USD = 1_000_000)
 * so `ai_calls.costUsd` stays an exact integer. Prices are never guessed in
 * code — an unpriced model fails loudly instead of recording a wrong cost;
 * see config/openai-pricing.json.
 */
export function estimateCostMicros(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = loadPricingTable()[model];
  if (!pricing) {
    throw new Error(
      `Preço não configurado para o modelo "${model}" em config/openai-pricing.json — adicione antes de usar este modelo.`,
    );
  }
  const promptCostUsd = (promptTokens / 1_000_000) * pricing.promptPerMillionUsd;
  const completionCostUsd = (completionTokens / 1_000_000) * pricing.completionPerMillionUsd;
  return Math.round((promptCostUsd + completionCostUsd) * 1_000_000);
}
