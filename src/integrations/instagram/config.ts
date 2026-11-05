export interface InstagramConfig {
  appSecret: string;
  webhookVerifyToken: string;
  accessToken: string;
  businessAccountId: string;
  graphApiVersion: string;
  graphApiBaseUrl: string;
  messagingWindowHours: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Reads Instagram Graph API / webhook credentials from env — see prompt.MD "Etapa 2 — API oficial". */
export function loadInstagramConfig(): InstagramConfig {
  return {
    appSecret: requireEnv("INSTAGRAM_APP_SECRET"),
    webhookVerifyToken: requireEnv("INSTAGRAM_WEBHOOK_VERIFY_TOKEN"),
    accessToken: requireEnv("INSTAGRAM_ACCESS_TOKEN"),
    businessAccountId: requireEnv("INSTAGRAM_BUSINESS_ACCOUNT_ID"),
    graphApiVersion: process.env.INSTAGRAM_GRAPH_API_VERSION ?? "v21.0",
    // Overridable in tests only — never set in production.
    graphApiBaseUrl: process.env.INSTAGRAM_GRAPH_API_BASE_URL ?? "https://graph.facebook.com",
    messagingWindowHours: readIntEnv("INSTAGRAM_MESSAGING_WINDOW_HOURS", 24),
  };
}
