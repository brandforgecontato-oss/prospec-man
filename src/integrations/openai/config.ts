export interface OpenAiConfig {
  apiKey: string;
  model: string;
  modelFast: string;
  monthlyBudgetUsd: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

function requireFloatEnv(name: string): number {
  const raw = requireEnv(name);
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Variável de ambiente inválida: ${name} deve ser um número positivo`);
  }
  return parsed;
}

/**
 * Reads OpenAI credentials/model names from env — see prompt.MD "Motor de
 * conversação (OpenAI)". Model names come only from env, never a floating
 * alias in code, so message quality doesn't drift on its own.
 */
export function loadOpenAiConfig(): OpenAiConfig {
  return {
    apiKey: requireEnv("OPENAI_API_KEY"),
    model: requireEnv("OPENAI_MODEL"),
    modelFast: requireEnv("OPENAI_MODEL_FAST"),
    monthlyBudgetUsd: requireFloatEnv("OPENAI_MONTHLY_BUDGET_USD"),
  };
}
