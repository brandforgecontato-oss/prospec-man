import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Customer pipeline (Funil A). Affiliate pipeline does not exist yet — see CLAUDE.md.
export const LEAD_PIPELINE_STAGES = [
  "discovered",
  "qualified",
  "contacted",
  "replied",
  "interested",
  "whatsapp_handoff",
  "registered",
  "active_customer",
  "closed",
] as const;

export type LeadPipelineStage = (typeof LEAD_PIPELINE_STAGES)[number];

export const LEAD_CHANNEL_STATES = [
  "browser_contact_pending",
  "browser_contact_sent",
  "waiting_inbound_reply",
  "api_eligible",
  "api_active",
  "api_window_closed",
  "human_review_required",
  "do_not_contact",
  "blocked",
  "completed",
] as const;

export type LeadChannelState = (typeof LEAD_CHANNEL_STATES)[number];

export const DECISION_MAKER_TYPES = [
  "owner",
  "employee",
  "store_account",
  "unknown",
] as const;

export type DecisionMakerType = (typeof DECISION_MAKER_TYPES)[number];

const utcNow = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const leads = sqliteTable(
  "leads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instagramUsername: text("instagram_username").notNull(),
    instagramUserId: text("instagram_user_id"),
    fullName: text("full_name"),
    bio: text("bio"),
    profileCategory: text("profile_category"),
    isPrivate: integer("is_private", { mode: "boolean" })
      .notNull()
      .default(false),
    followerCount: integer("follower_count"),
    discoveredVia: text("discovered_via"),
    icpScore: integer("icp_score"),
    decisionMakerType: text("decision_maker_type", {
      enum: DECISION_MAKER_TYPES,
    })
      .notNull()
      .default("unknown"),
    pipelineStage: text("pipeline_stage", { enum: LEAD_PIPELINE_STAGES })
      .notNull()
      .default("discovered"),
    channelState: text("channel_state", { enum: LEAD_CHANNEL_STATES })
      .notNull()
      .default("browser_contact_pending"),
    priority: integer("priority").notNull().default(0),
    doNotContact: integer("do_not_contact", { mode: "boolean" })
      .notNull()
      .default(false),
    notes: text("notes"),
    nextActionAt: text("next_action_at"),
    nextActionNote: text("next_action_note"),
    createdAt: text("created_at").notNull().default(utcNow),
    updatedAt: text("updated_at").notNull().default(utcNow),
  },
  (table) => [
    uniqueIndex("leads_instagram_username_unique").on(
      table.instagramUsername,
    ),
    uniqueIndex("leads_instagram_user_id_unique").on(table.instagramUserId),
    index("leads_pipeline_stage_idx").on(table.pipelineStage),
    index("leads_channel_state_idx").on(table.channelState),
  ],
);

export type Lead = typeof leads.$inferSelect;

export const MESSAGE_DIRECTIONS = ["outbound", "inbound"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_CHANNELS = ["browser", "api", "whatsapp"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MESSAGE_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "failed",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id),
    direction: text("direction", { enum: MESSAGE_DIRECTIONS }).notNull(),
    channel: text("channel", { enum: MESSAGE_CHANNELS }).notNull(),
    content: text("content").notNull(),
    variant: text("variant"),
    status: text("status", { enum: MESSAGE_STATUSES })
      .notNull()
      .default("queued"),
    providerMessageId: text("provider_message_id"),
    sentAt: text("sent_at"),
    createdAt: text("created_at").notNull().default(utcNow),
  },
  (table) => [
    uniqueIndex("messages_provider_message_id_unique").on(
      table.providerMessageId,
    ),
    index("messages_lead_id_idx").on(table.leadId),
  ],
);

export const JOB_TYPES = [
  "discover_profile",
  "send_browser_dm",
  "poll_webhook_inbox",
  "send_api_message",
  "decide_and_reply",
  "follow_up",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "dead_letter",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    type: text("type", { enum: JOB_TYPES }).notNull(),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("pending"),
    payload: text("payload", { mode: "json" }).notNull(),
    leadId: integer("lead_id").references(() => leads.id),
    scheduledFor: text("scheduled_for").notNull().default(utcNow),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default(utcNow),
    updatedAt: text("updated_at").notNull().default(utcNow),
  },
  (table) => [
    uniqueIndex("jobs_idempotency_key_unique").on(table.idempotencyKey),
    index("jobs_status_scheduled_for_idx").on(
      table.status,
      table.scheduledFor,
    ),
  ],
);

export const EXPERIMENT_STATUSES = ["running", "paused", "concluded"] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const experiments = sqliteTable("experiments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  variable: text("variable").notNull(),
  status: text("status", { enum: EXPERIMENT_STATUSES })
    .notNull()
    .default("running"),
  // Array of ExperimentVariant (src/features/experiments/types.ts): key, label,
  // weight (0-100, sums to 100), isControl, isExploration. Weights are the only
  // field the ramp logic (features/experiments/weights.ts) rewrites over time.
  variants: text("variants", { mode: "json" }).notNull(),
  // Gate against declaring a winner early (prompt.MD "sem declarar vencedor
  // cedo") — a variant's weight only moves once every variant has at least
  // this many assignments.
  minSampleSize: integer("min_sample_size").notNull().default(30),
  createdAt: text("created_at").notNull().default(utcNow),
});

export type Experiment = typeof experiments.$inferSelect;

export const experimentAssignments = sqliteTable(
  "experiment_assignments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    experimentId: integer("experiment_id")
      .notNull()
      .references(() => experiments.id),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id),
    variant: text("variant").notNull(),
    isControl: integer("is_control", { mode: "boolean" })
      .notNull()
      .default(false),
    assignedAt: text("assigned_at").notNull().default(utcNow),
  },
  (table) => [
    uniqueIndex("experiment_assignments_unique").on(
      table.experimentId,
      table.leadId,
    ),
  ],
);

export const EVENT_TYPES = [
  "lead_discovered",
  "pipeline_stage_changed",
  "channel_state_changed",
  "message_sent",
  "message_received",
  "circuit_breaker_tripped",
  "budget_exceeded",
  "note_added",
  "lead_created",
  "browser_unavailable",
  "dm_send_failed",
  "webhook_message_unmatched",
  "channel_lock_lost",
  "ai_reply_decided",
  "ai_claim_blocked",
  "experiment_variant_assigned",
  "experiment_weights_adjusted",
  "system_resumed",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: integer("lead_id").references(() => leads.id),
    type: text("type", { enum: EVENT_TYPES }).notNull(),
    payload: text("payload", { mode: "json" }),
    createdAt: text("created_at").notNull().default(utcNow),
  },
  (table) => [index("events_lead_id_idx").on(table.leadId)],
);

export const aiCalls = sqliteTable(
  "ai_calls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    leadId: integer("lead_id").references(() => leads.id),
    model: text("model").notNull(),
    purpose: text("purpose").notNull(),
    promptTokens: integer("prompt_tokens").notNull(),
    completionTokens: integer("completion_tokens").notNull(),
    // Stored as micro-USD (1 USD = 1_000_000) to keep costs as exact integers.
    costUsd: integer("cost_usd_micros").notNull(),
    createdAt: text("created_at").notNull().default(utcNow),
  },
  (table) => [index("ai_calls_lead_id_idx").on(table.leadId)],
);

// Single-row table (id is always 1) holding the general "pausa geral" switch
// from prompt.MD "Segurança e confiabilidade" — src/features/safety/circuit-breaker.ts.
// No seed migration needed: reads treat a missing row as not-paused, writes upsert.
export const systemState = sqliteTable("system_state", {
  id: integer("id").primaryKey(),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  pausedReason: text("paused_reason"),
  pausedAt: text("paused_at"),
  updatedAt: text("updated_at").notNull().default(utcNow),
});
