import { db } from "@/db/client";
import { aiCalls } from "@/db/schema";
import { estimateCostMicros } from "@/integrations/openai/pricing";

export interface RecordAiCallInput {
  leadId: number | null;
  model: string;
  purpose: string;
  promptTokens: number;
  completionTokens: number;
}

/** Persists one OpenAI call's cost/usage to `ai_calls` — the source for cost-per-lead in the CRM. */
export function recordAiCall(input: RecordAiCallInput): void {
  db.insert(aiCalls)
    .values({
      leadId: input.leadId,
      model: input.model,
      purpose: input.purpose,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      costUsd: estimateCostMicros(input.model, input.promptTokens, input.completionTokens),
    })
    .run();
}
