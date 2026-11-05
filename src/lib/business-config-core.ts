import { readFileSync } from "node:fs";
import path from "node:path";

export interface BusinessConfig {
  ownerName: string;
  ownerRole: string;
  companyName: string;
  companyWebsite: string | null;
  instagramHandle: string;
  whatsappLink: string;
  affiliateGroupLink: string | null;
  onePLinePitch: string;
  howItWorks: string[];
  revenueModel: string;
  marketJargon: { term: string; meaning: string }[];
  verifiedClaims: string[];
  unverifiedClaims: string[];
  icpSegments: string[];
  icpKeywords: string[];
  affiliateTopics: string[];
  geography: string;
}

let cachedConfig: BusinessConfig | undefined;

/**
 * No `server-only` guard here: the worker imports this directly (it runs as a
 * standalone Node process via tsx, outside the Next runtime — see queue.ts).
 * `@/lib/business-config` re-exports this with the guard for Next server code.
 */
export function getBusinessConfig(): BusinessConfig {
  if (!cachedConfig) {
    const filePath = path.join(process.cwd(), "config", "business.json");
    cachedConfig = JSON.parse(readFileSync(filePath, "utf-8")) as BusinessConfig;
  }
  return cachedConfig;
}
