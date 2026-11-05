"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  events,
  leads,
  LEAD_CHANNEL_STATES,
  LEAD_PIPELINE_STAGES,
  type LeadChannelState,
  type LeadPipelineStage,
} from "@/db/schema";
import { enqueueJob } from "@/worker/queue";

function requireString(formData: FormData, field: string): string {
  const value = formData.get(field);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Campo obrigatório ausente: ${field}`);
  }
  return value.trim();
}

function optionalString(formData: FormData, field: string): string | null {
  const value = formData.get(field);
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

export async function createLeadAction(formData: FormData) {
  const instagramUsername = requireString(formData, "instagramUsername").replace(/^@/, "");
  const fullName = optionalString(formData, "fullName");
  const bio = optionalString(formData, "bio");
  const discoveredVia = optionalString(formData, "discoveredVia");
  const notes = optionalString(formData, "notes");

  const created = db
    .insert(leads)
    .values({ instagramUsername, fullName, bio, discoveredVia, notes })
    .returning({ id: leads.id })
    .get();

  db.insert(events)
    .values({
      leadId: created.id,
      type: "lead_created",
      payload: { instagramUsername },
    })
    .run();

  enqueueJob({
    type: "discover_profile",
    payload: { instagramUsername },
    idempotencyKey: `discover_profile:${instagramUsername}`,
    leadId: created.id,
  });

  revalidatePath("/leads");
  redirect(`/leads/${created.id}`);
}

export async function updatePipelineStageAction(formData: FormData) {
  const leadId = Number(requireString(formData, "leadId"));
  const stage = requireString(formData, "pipelineStage") as LeadPipelineStage;
  if (!LEAD_PIPELINE_STAGES.includes(stage)) {
    throw new Error("Etapa de funil inválida");
  }

  const before = db.select().from(leads).where(eq(leads.id, leadId)).get();

  db.update(leads)
    .set({ pipelineStage: stage, updatedAt: new Date().toISOString() })
    .where(eq(leads.id, leadId))
    .run();

  db.insert(events)
    .values({
      leadId,
      type: "pipeline_stage_changed",
      payload: { from: before?.pipelineStage, to: stage, by: "operator" },
    })
    .run();

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
}

export async function updateChannelStateAction(formData: FormData) {
  const leadId = Number(requireString(formData, "leadId"));
  const channelState = requireString(formData, "channelState") as LeadChannelState;
  if (!LEAD_CHANNEL_STATES.includes(channelState)) {
    throw new Error("Estado de canal inválido");
  }

  const before = db.select().from(leads).where(eq(leads.id, leadId)).get();

  db.update(leads)
    .set({ channelState, updatedAt: new Date().toISOString() })
    .where(eq(leads.id, leadId))
    .run();

  db.insert(events)
    .values({
      leadId,
      type: "channel_state_changed",
      payload: { from: before?.channelState, to: channelState, by: "operator" },
    })
    .run();

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
}

export async function addNoteAction(formData: FormData) {
  const leadId = Number(requireString(formData, "leadId"));
  const note = requireString(formData, "note");

  db.insert(events)
    .values({ leadId, type: "note_added", payload: { text: note } })
    .run();

  revalidatePath(`/leads/${leadId}`);
}

export async function setNextActionAction(formData: FormData) {
  const leadId = Number(requireString(formData, "leadId"));
  const nextActionAt = optionalString(formData, "nextActionAt");
  const nextActionNote = optionalString(formData, "nextActionNote");

  db.update(leads)
    .set({
      nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : null,
      nextActionNote,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(leads.id, leadId))
    .run();

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
}
