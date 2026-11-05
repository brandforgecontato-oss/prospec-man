import { CONVERSATION_ACTIONS, CONVERSATION_INTENTS, type ConversationIntent } from "./types";
import type { ConversationContext } from "./context";

export interface PromptPair {
  system: string;
  user: string;
}

function formatHistory(history: ConversationContext["history"]): string {
  if (history.length === 0) return "(sem mensagens anteriores)";
  return history
    .map((message) => `${message.direction === "inbound" ? "Lead" : "Nós"}: ${message.content}`)
    .join("\n");
}

function formatLeadProfile(context: ConversationContext): string {
  const { lead } = context;
  return [
    `Username: @${lead.instagramUsername}`,
    `Nome: ${lead.fullName ?? "desconhecido"}`,
    `Bio: ${lead.bio ?? "desconhecida"}`,
    `Categoria do perfil: ${lead.profileCategory ?? "desconhecida"}`,
    `Tipo (dono/funcionário/loja/desconhecido): ${lead.decisionMakerType}`,
    `Etapa do funil: ${lead.pipelineStage}`,
  ].join("\n");
}

/** Classification prompt (OPENAI_MODEL_FAST): only extracts the lead's intent from their latest message. */
export function buildIntentClassificationPrompt(context: ConversationContext, latestInboundMessage: string): PromptPair {
  const system = [
    "Você classifica a intenção de uma mensagem recebida no Instagram durante uma prospecção comercial.",
    `Responda só com JSON no formato {"intent": "<uma das opções>"}.`,
    `Opções válidas: ${CONVERSATION_INTENTS.join(", ")}.`,
    'Se o lead pedir para parar de receber mensagens, remover, descadastrar ou algo equivalente, use "opt_out" mesmo que a frase também pareça outra coisa.',
  ].join("\n");

  const user = [
    "Perfil do lead:",
    formatLeadProfile(context),
    "",
    "Histórico da conversa:",
    formatHistory(context.history),
    "",
    `Última mensagem do lead: "${latestInboundMessage}"`,
  ].join("\n");

  return { system, user };
}

/** Decision prompt (OPENAI_MODEL): picks the next action and drafts the reply, if any. */
export function buildDecisionPrompt(context: ConversationContext, intent: ConversationIntent): PromptPair {
  const { business } = context;

  const system = [
    `Você é ${business.ownerName} (${business.ownerRole}) conversando pelo Instagram da ${business.companyName}, de forma pessoal e direta — nunca robótica.`,
    `O que a empresa faz: ${business.onePLinePitch}`,
    business.howItWorks.length > 0 ? `Como funciona: ${business.howItWorks.join("; ")}.` : "",
    business.marketJargon.length > 0
      ? `Jargão do nicho: ${business.marketJargon.map((entry) => `${entry.term} = ${entry.meaning}`).join("; ")}.`
      : "",
    "",
    "REGRA ABSOLUTA: você só pode afirmar, sobre a empresa ou seus resultados, o que está na lista VERIFIED_CLAIMS abaixo — com essas palavras ou próximas, nunca inventando número, resultado ou garantia.",
    `VERIFIED_CLAIMS: ${business.verifiedClaims.length > 0 ? business.verifiedClaims.join(" | ") : "(nenhuma disponível ainda — não afirme nenhum resultado ou case)"}`,
    "Nunca mencione, parafraseie ou insinue nada da lista abaixo — são afirmações ainda não comprovadas:",
    `UNVERIFIED_CLAIMS (proibido citar): ${business.unverifiedClaims.length > 0 ? business.unverifiedClaims.join(" | ") : "(nenhuma)"}`,
    "",
    `Se o lead demonstrar interesse real de lojista em fechar/contratar, a ação é "handoff_whatsapp" — o link do WhatsApp é adicionado automaticamente, não invente ou escreva o link você mesmo.`,
    "Se a intenção for opt_out, a ação é sempre \"close\" e a reply deve ser null — o sistema já trata o descadastro.",
    `Responda só com JSON no formato {"action": "<uma das opções>", "reply": "<mensagem para o lead em português, ou null se a ação não envia mensagem>", "followUpNote": "<nota curta para o CRM se action for schedule_follow_up, senão null>"}.`,
    `Opções de action: ${CONVERSATION_ACTIONS.join(", ")}.`,
    "reply deve ser curta, natural, em português do Brasil, sem emoji em excesso, sem parecer copiada e colada.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    "Perfil do lead:",
    formatLeadProfile(context),
    "",
    "Histórico da conversa (mais recente por último):",
    formatHistory(context.history),
    "",
    `Intenção já classificada para a última mensagem do lead: ${intent}`,
  ].join("\n");

  return { system, user };
}
