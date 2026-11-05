import OpenAI from "openai";

import type { OpenAiConfig } from "./config";

let cachedClient: OpenAI | undefined;

function getClient(config: OpenAiConfig): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: config.apiKey });
  }
  return cachedClient;
}

/** Test-only: drops the cached client so a mocked constructor takes effect. */
export function resetOpenAiClientForTests(): void {
  cachedClient = undefined;
}

export interface StructuredCompletionResult {
  data: unknown;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Runs one chat completion constrained to JSON output and returns the parsed
 * object plus token usage (for cost accounting in ai_calls). Model selection
 * (redação/decisão vs. classificação/extração) is the caller's job — see
 * prompt.MD "Motor de conversação (OpenAI)".
 */
export async function runJsonCompletion(
  config: OpenAiConfig,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<StructuredCompletionResult> {
  const client = getClient(config);
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Chamada à OpenAI não retornou conteúdo");
  }

  return {
    data: JSON.parse(content) as unknown,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
  };
}
