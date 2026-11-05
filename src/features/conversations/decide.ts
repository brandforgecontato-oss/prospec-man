import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { events, leads } from "@/db/schema";
import { tryTransitionChannelState } from "@/features/campaigns/channel-lock";
import { pauseSystem } from "@/features/safety/circuit-breaker";
import { runJsonCompletion } from "@/integrations/openai/client";
import { loadOpenAiConfig } from "@/integrations/openai/config";
import { getBusinessConfig } from "@/lib/business-config-core";
import type { JobContext } from "@/worker/handlers";
import { enqueueJob } from "@/worker/queue";

import { recordAiCall } from "./ai-call-log";
import { isMonthlyBudgetExceeded } from "./budget";
import { violatesUnverifiedClaims } from "./claims-guard";
import { buildConversationContext } from "./context";
import { buildWhatsappHandoffMessage } from "./handoff-message";
import { buildDecisionPrompt, buildIntentClassificationPrompt } from "./prompt";
import {
  CONVERSATION_ACTIONS,
  CONVERSATION_INTENTS,
  type ConversationAction,
  type ConversationDecision,
  type ConversationIntent,
} from "./types";

export interface DecideAndReplyPayload {
  leadId: number;
  latestInboundMessage: string;
}

function parsePayload(payload: unknown): DecideAndReplyPayload {
  const data = payload as Partial<DecideAndReplyPayload> | null;
  if (typeof data?.leadId !== "number" || !data.latestInboundMessage) {
    throw new Error("decide_and_reply: payload.leadId/latestInboundMessage ausente");
  }
  return { leadId: data.leadId, latestInboundMessage: data.latestInboundMessage };
}

function parseIntent(data: unknown): ConversationIntent {
  const intent = (data as { intent?: string } | null)?.intent;
  return (CONVERSATION_INTENTS as readonly string[]).includes(intent ?? "")
    ? (intent as ConversationIntent)
    : "ambiguous";
}

function parseDecision(data: unknown): ConversationDecision {
  const raw = data as Partial<{ action: string; reply: string | null; followUpNote: string | null }> | null;
  const action = (CONVERSATION_ACTIONS as readonly string[]).includes(raw?.action ?? "")
    ? (raw!.action as ConversationAction)
    : "escalate_to_human";
  return {
    action,
    reply: typeof raw?.reply === "string" && raw.reply.trim().length > 0 ? raw.reply.trim() : null,
    followUpNote:
      typeof raw?.followUpNote === "string" && raw.followUpNote.trim().length > 0 ? raw.followUpNote.trim() : null,
  };
}

function markBudgetExceeded(leadId: number, jobId: number, stage: string): void {
  db.insert(events).values({ leadId, type: "budget_exceeded", payload: { jobId, stage } }).run();
  tryTransitionChannelState(leadId, "api_active", "human_review_required");
  // prompt.MD "Pausa automática diante de... estouro de orçamento da OpenAI"
  // — this isn't just about this one lead, every AI call should stop.
  pauseSystem("Orçamento mensal da OpenAI excedido");
}

/**
 * Interprets one inbound Instagram message and decides + drafts the next
 * action — prompt.MD "Motor de conversação (OpenAI)". Runs after
 * poll_webhook_inbox records the message and (if needed) hands channel
 * ownership to the API. Two OpenAI calls: OPENAI_MODEL_FAST classifies
 * intent, OPENAI_MODEL decides the action and drafts the reply, each logged
 * separately in ai_calls (`purpose: "classify_intent"` / `"decide_reply"`).
 */
export async function decideAndReply(payload: unknown, jobContext: JobContext): Promise<void> {
  const { leadId, latestInboundMessage } = parsePayload(payload);

  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) {
    throw new Error(`decide_and_reply: lead ${leadId} não encontrado`);
  }
  if (lead.doNotContact || lead.channelState === "do_not_contact" || lead.channelState === "blocked") {
    return;
  }
  // Only the API side runs the AI conversation — prompt.MD "IA interpreta e responde pela API oficial".
  if (lead.channelState !== "api_active") {
    return;
  }

  const openAiConfig = loadOpenAiConfig();
  if (isMonthlyBudgetExceeded(openAiConfig.monthlyBudgetUsd)) {
    markBudgetExceeded(leadId, jobContext.id, "before_classify_intent");
    return;
  }

  const business = getBusinessConfig();
  const context = buildConversationContext(lead, business);

  const intentPrompt = buildIntentClassificationPrompt(context, latestInboundMessage);
  const intentCompletion = await runJsonCompletion(
    openAiConfig,
    openAiConfig.modelFast,
    intentPrompt.system,
    intentPrompt.user,
  );
  recordAiCall({
    leadId,
    model: openAiConfig.modelFast,
    purpose: "classify_intent",
    promptTokens: intentCompletion.promptTokens,
    completionTokens: intentCompletion.completionTokens,
  });
  const intent = parseIntent(intentCompletion.data);

  // "Pedido de parar é atendido na hora" — enforced in code, not left to the model's chosen action.
  if (intent === "opt_out") {
    tryTransitionChannelState(leadId, "api_active", "do_not_contact");
    db.update(leads)
      .set({ doNotContact: true, updatedAt: new Date().toISOString() })
      .where(eq(leads.id, leadId))
      .run();
    db.insert(events)
      .values({ leadId, type: "channel_state_changed", payload: { to: "do_not_contact", by: "ai", intent } })
      .run();
    return;
  }

  if (isMonthlyBudgetExceeded(openAiConfig.monthlyBudgetUsd)) {
    markBudgetExceeded(leadId, jobContext.id, "before_decide_reply");
    return;
  }

  const decisionPrompt = buildDecisionPrompt(context, intent);
  const decisionCompletion = await runJsonCompletion(
    openAiConfig,
    openAiConfig.model,
    decisionPrompt.system,
    decisionPrompt.user,
  );
  recordAiCall({
    leadId,
    model: openAiConfig.model,
    purpose: "decide_reply",
    promptTokens: decisionCompletion.promptTokens,
    completionTokens: decisionCompletion.completionTokens,
  });
  const decision = parseDecision(decisionCompletion.data);

  db.insert(events)
    .values({ leadId, type: "ai_reply_decided", payload: { intent, action: decision.action, reply: decision.reply } })
    .run();

  if (decision.reply) {
    const violatedClaim = violatesUnverifiedClaims(decision.reply, business.unverifiedClaims);
    if (violatedClaim) {
      db.insert(events)
        .values({ leadId, type: "ai_claim_blocked", payload: { claim: violatedClaim, reply: decision.reply } })
        .run();
      tryTransitionChannelState(leadId, "api_active", "human_review_required");
      return;
    }
  }

  switch (decision.action) {
    case "reply":
    case "ask":
    case "present":
    case "handle_objection": {
      if (!decision.reply) return;
      enqueueJob({
        type: "send_api_message",
        payload: { leadId, content: decision.reply },
        idempotencyKey: `send_api_message:${leadId}:${jobContext.id}`,
        leadId,
      });
      return;
    }
    case "handoff_whatsapp": {
      const content = buildWhatsappHandoffMessage(decision.reply, business.whatsappLink);
      enqueueJob({
        type: "send_api_message",
        payload: { leadId, content },
        idempotencyKey: `send_api_message:${leadId}:${jobContext.id}`,
        leadId,
      });
      db.update(leads)
        .set({ pipelineStage: "whatsapp_handoff", updatedAt: new Date().toISOString() })
        .where(eq(leads.id, leadId))
        .run();
      db.insert(events)
        .values({ leadId, type: "pipeline_stage_changed", payload: { to: "whatsapp_handoff", by: "ai" } })
        .run();
      return;
    }
    case "schedule_follow_up": {
      db.update(leads)
        .set({
          nextActionNote: decision.followUpNote ?? "Follow-up sugerido pela IA",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(leads.id, leadId))
        .run();
      db.insert(events).values({ leadId, type: "note_added", payload: { note: decision.followUpNote, by: "ai" } }).run();
      return;
    }
    case "close": {
      tryTransitionChannelState(leadId, "api_active", "completed", { pipelineStage: "closed" });
      db.insert(events).values({ leadId, type: "pipeline_stage_changed", payload: { to: "closed", by: "ai" } }).run();
      return;
    }
    case "escalate_to_human": {
      tryTransitionChannelState(leadId, "api_active", "human_review_required");
      return;
    }
    case "wait":
    default:
      return;
  }
}
