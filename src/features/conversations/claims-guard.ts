/**
 * Code-level backstop for "IA só pode enviar o que está em verifiedClaims.
 * Tudo em unverifiedClaims é bloqueado, sem paráfrase" (CLAUDE.md). The
 * prompt already instructs the model not to state unverified claims; this
 * catches it anyway if the model states one verbatim, so a bad reply never
 * reaches the lead — it gets escalated to a human instead.
 */
export function violatesUnverifiedClaims(reply: string, unverifiedClaims: string[]): string | null {
  const lower = reply.toLowerCase();
  return unverifiedClaims.find((claim) => claim.trim().length > 0 && lower.includes(claim.toLowerCase())) ?? null;
}
