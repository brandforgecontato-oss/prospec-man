import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { messages, type DecisionMakerType, type Lead, type LeadPipelineStage } from "@/db/schema";
import type { BusinessConfig } from "@/lib/business-config-core";

export interface ConversationContext {
  lead: {
    fullName: string | null;
    instagramUsername: string;
    bio: string | null;
    profileCategory: string | null;
    decisionMakerType: DecisionMakerType;
    pipelineStage: LeadPipelineStage;
    icpScore: number | null;
  };
  history: { direction: "inbound" | "outbound"; content: string }[];
  business: BusinessConfig;
}

/** Full message history for a lead, oldest first — context for the AI's decision. */
export function buildConversationContext(lead: Lead, business: BusinessConfig): ConversationContext {
  const history = db
    .select({ direction: messages.direction, content: messages.content })
    .from(messages)
    .where(eq(messages.leadId, lead.id))
    .orderBy(asc(messages.createdAt))
    .all();

  return {
    lead: {
      fullName: lead.fullName,
      instagramUsername: lead.instagramUsername,
      bio: lead.bio,
      profileCategory: lead.profileCategory,
      decisionMakerType: lead.decisionMakerType,
      pipelineStage: lead.pipelineStage,
      icpScore: lead.icpScore,
    },
    history,
    business,
  };
}
