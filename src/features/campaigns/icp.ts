import type { DecisionMakerType } from "@/db/schema";

const OWNER_HINTS = ["dono", "dona", "proprietári", "founder", "fundador", "ceo", "owner"];
const EMPLOYEE_HINTS = ["funcionári", "equipe", "atendimento", "team", "colaborador"];
const STORE_HINTS = ["loja", "store", "official", "oficial"];

/** Counts how many ICP keywords show up in the bio — a stand-in for real scoring until the OpenAI motor (prompt.MD etapa 13) exists. */
export function computeIcpScore(bio: string | null, icpKeywords: string[]): number {
  if (!bio || icpKeywords.length === 0) return 0;
  const haystack = bio.toLowerCase();
  const matches = icpKeywords.filter((keyword) => haystack.includes(keyword.toLowerCase())).length;
  return Math.min(100, matches * 25);
}

function includesAny(haystack: string, hints: string[]): boolean {
  return hints.some((hint) => haystack.includes(hint));
}

/** Keyword heuristic for "loja, funcionário, dono ou decisor" (prompt.MD Funil A, passo 3) — a placeholder for real AI classification. */
export function classifyDecisionMaker(
  bio: string | null,
  profileCategory: string | null,
): DecisionMakerType {
  const haystack = `${bio ?? ""} ${profileCategory ?? ""}`.toLowerCase();
  if (includesAny(haystack, OWNER_HINTS)) return "owner";
  if (includesAny(haystack, EMPLOYEE_HINTS)) return "employee";
  if (includesAny(haystack, STORE_HINTS)) return "store_account";
  return "unknown";
}

export function computePriority(icpScore: number, decisionMakerType: DecisionMakerType): number {
  const boost = decisionMakerType === "owner" ? 20 : decisionMakerType === "store_account" ? 10 : 0;
  return icpScore + boost;
}
