/**
 * The WhatsApp link itself always comes from config/business.json, never
 * from the model's own text — prompt.MD "Lojista interessado → WHATSAPP_LINK".
 * The AI's `reply` supplies the natural lead-in sentence; this appends the
 * verbatim link so it can never be mistyped or hallucinated.
 */
export function buildWhatsappHandoffMessage(leadIn: string | null, whatsappLink: string): string {
  const intro = leadIn?.trim() || "Bora continuar por lá? Te chamo no WhatsApp:";
  return `${intro} ${whatsappLink}`;
}
