interface OpeningMessageInput {
  fullName: string | null;
  instagramUsername: string;
  bio: string | null;
  profileCategory: string | null;
  icpKeywords: string[];
  /** Variant key from the "opening_message" experiment (src/features/experiments), if one is running. Unknown/absent keys fall back to "personal_hook". */
  variant?: string | null;
}

export const OPENING_MESSAGE_VARIANTS = ["personal_hook", "direct_question"] as const;
export type OpeningMessageVariant = (typeof OPENING_MESSAGE_VARIANTS)[number];

function firstName(fullName: string | null, instagramUsername: string): string {
  const candidate = fullName?.trim().split(/\s+/)[0];
  return candidate && candidate.length > 0 ? candidate : `@${instagramUsername}`;
}

function findHook(bio: string | null, profileCategory: string | null, icpKeywords: string[]): string | null {
  const haystack = bio ?? "";
  const lower = haystack.toLowerCase();
  const keyword = icpKeywords.find((word) => lower.includes(word.toLowerCase()));
  if (keyword) return keyword.toLowerCase();
  return profileCategory?.trim().toLowerCase() ?? null;
}

/**
 * Builds the first, cold DM: short, personal, grounded in the profile's real
 * content — no company pitch yet. Presenting OWNER_NAME/company comes later,
 * "no momento certo" (prompt.MD Funil A, passo 9), once the AI conversation
 * engine (etapa 13) exists to judge that moment. Both variants are
 * templates, not AI generation, so neither ever risks stating an unverified
 * claim — the "mensagem inicial" variable from prompt.MD "Otimização
 * contínua" is which of these two hooks converts better, decided by
 * src/features/experiments, not by wording risk.
 */
export function buildOpeningMessage(input: OpeningMessageInput): string {
  const name = firstName(input.fullName, input.instagramUsername);
  const hook = findHook(input.bio, input.profileCategory, input.icpKeywords);

  if (input.variant === "direct_question") {
    return hook
      ? `Oi, ${name}! Vi seu trabalho com ${hook} — posso te fazer uma pergunta rápida sobre isso?`
      : `Oi, ${name}! Vi seu perfil — posso te fazer uma pergunta rápida sobre o que vocês fazem?`;
  }

  if (hook) {
    return `Oi, ${name}! Vi seu perfil e achei muito bacana o trabalho com ${hook}. Passando só pra dizer que curti 🙂`;
  }
  return `Oi, ${name}! Vi seu perfil e achei muito bacana o que vocês fazem por aí. Passando só pra dizer que curti 🙂`;
}
