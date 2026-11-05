import "server-only";

import { and, desc, eq, isNotNull, lt, ne, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  type LeadPipelineStage,
  aiCalls,
  events,
  jobs,
  leads,
  messages,
} from "@/db/schema";
import { PIPELINE_STAGE_LABELS, CHANNEL_STATE_LABELS } from "./labels";
import type { LeadChannelState } from "@/db/schema";

function describeEventPayload(type: string, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;

  if (type === "note_added" && typeof data.text === "string") {
    return data.text;
  }
  if (type === "pipeline_stage_changed") {
    const from = PIPELINE_STAGE_LABELS[data.from as LeadPipelineStage] ?? data.from;
    const to = PIPELINE_STAGE_LABELS[data.to as LeadPipelineStage] ?? data.to;
    return `${from ?? "—"} → ${to ?? "—"}`;
  }
  if (type === "channel_state_changed") {
    const from = CHANNEL_STATE_LABELS[data.from as LeadChannelState] ?? data.from;
    const to = CHANNEL_STATE_LABELS[data.to as LeadChannelState] ?? data.to;
    return `${from ?? "—"} → ${to ?? "—"}`;
  }
  if (type === "lead_created" && typeof data.instagramUsername === "string") {
    return `@${data.instagramUsername}`;
  }
  return JSON.stringify(data);
}

export function listLeadsByStage() {
  const rows = db.select().from(leads).orderBy(desc(leads.priority), desc(leads.updatedAt)).all();
  const byStage = new Map<LeadPipelineStage, typeof rows>();
  for (const row of rows) {
    const bucket = byStage.get(row.pipelineStage) ?? [];
    bucket.push(row);
    byStage.set(row.pipelineStage, bucket);
  }
  return byStage;
}

export function getLeadById(id: number) {
  return db.select().from(leads).where(eq(leads.id, id)).get();
}

export interface TimelineEntry {
  id: string;
  kind: "message" | "event";
  createdAt: string;
  summary: string;
  detail?: string | null;
}

export function getLeadTimeline(leadId: number): TimelineEntry[] {
  const messageRows = db
    .select()
    .from(messages)
    .where(eq(messages.leadId, leadId))
    .all();
  const eventRows = db.select().from(events).where(eq(events.leadId, leadId)).all();

  const messageEntries: TimelineEntry[] = messageRows.map((row) => ({
    id: `message-${row.id}`,
    kind: "message",
    createdAt: row.createdAt,
    summary: `${row.direction === "outbound" ? "Enviada" : "Recebida"} · ${row.channel}`,
    detail: row.content,
  }));

  const eventEntries: TimelineEntry[] = eventRows.map((row) => ({
    id: `event-${row.id}`,
    kind: "event",
    createdAt: row.createdAt,
    summary: row.type,
    detail: describeEventPayload(row.type, row.payload),
  }));

  return [...messageEntries, ...eventEntries].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export function getDashboardStats() {
  const stageCounts = db
    .select({ stage: leads.pipelineStage, count: sql<number>`count(*)` })
    .from(leads)
    .groupBy(leads.pipelineStage)
    .all();

  const totalLeads = stageCounts.reduce((sum, row) => sum + row.count, 0);

  const overdueFollowUps = db
    .select()
    .from(leads)
    .where(
      and(
        isNotNull(leads.nextActionAt),
        lt(leads.nextActionAt, new Date().toISOString()),
        ne(leads.pipelineStage, "closed"),
      ),
    )
    .orderBy(leads.nextActionAt)
    .all();

  const jobStatusCounts = db
    .select({ status: jobs.status, count: sql<number>`count(*)` })
    .from(jobs)
    .groupBy(jobs.status)
    .all();

  const deadLetterJobs = db
    .select()
    .from(jobs)
    .where(eq(jobs.status, "dead_letter"))
    .orderBy(desc(jobs.updatedAt))
    .all();

  const costRow = db
    .select({ totalMicros: sql<number>`coalesce(sum(cost_usd_micros), 0)` })
    .from(aiCalls)
    .get();
  const totalAiCostUsd = (costRow?.totalMicros ?? 0) / 1_000_000;

  const activeCustomerCount =
    stageCounts.find((row) => row.stage === "active_customer")?.count ?? 0;
  const costPerLeadUsd = totalLeads > 0 ? totalAiCostUsd / totalLeads : 0;
  const costPerActiveCustomerUsd =
    activeCustomerCount > 0 ? totalAiCostUsd / activeCustomerCount : null;

  return {
    totalLeads,
    stageCounts,
    overdueFollowUps,
    jobStatusCounts,
    deadLetterJobs,
    totalAiCostUsd,
    costPerLeadUsd,
    costPerActiveCustomerUsd,
  };
}
