// Intentions and actions from prompt.MD "Motor de conversação (OpenAI)".
// Kept separate from the DB enums in src/db/schema.ts: these describe one AI
// decision, not persisted lead/channel state.

export const CONVERSATION_INTENTS = [
  "interested",
  "asked_info",
  "asked_pricing",
  "wants_whatsapp",
  "not_the_owner",
  "will_forward",
  "objection",
  "not_interested",
  "opt_out",
  "ambiguous",
  "needs_human",
] as const;
export type ConversationIntent = (typeof CONVERSATION_INTENTS)[number];

export const CONVERSATION_ACTIONS = [
  "reply",
  "ask",
  "present",
  "handle_objection",
  "handoff_whatsapp",
  "wait",
  "schedule_follow_up",
  "close",
  "escalate_to_human",
] as const;
export type ConversationAction = (typeof CONVERSATION_ACTIONS)[number];

export interface ConversationDecision {
  action: ConversationAction;
  reply: string | null;
  followUpNote: string | null;
}
