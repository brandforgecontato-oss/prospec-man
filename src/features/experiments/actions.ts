"use server";

import { revalidatePath } from "next/cache";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { EXPERIMENT_STATUSES, experiments, type ExperimentStatus } from "@/db/schema";
import { OPENING_MESSAGE_VARIANTS } from "@/features/campaigns/message";

import type { ExperimentVariant } from "./types";

function requireString(formData: FormData, field: string): string {
  const value = formData.get(field);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Campo obrigatório ausente: ${field}`);
  }
  return value.trim();
}

/**
 * Only the "opening_message" variable is wired to real traffic today (see
 * outreach.ts) — this form creates a control-vs-challenger test between its
 * two known templates rather than accepting an arbitrary variable name,
 * since a variable with no consumer would just sit unused.
 */
export async function createOpeningMessageExperimentAction(formData: FormData) {
  const name = requireString(formData, "name");
  const challengerWeight = Number(requireString(formData, "challengerWeight"));
  if (!Number.isFinite(challengerWeight) || challengerWeight <= 0 || challengerWeight >= 100) {
    throw new Error("Peso da variante desafiante deve estar entre 1 e 99");
  }

  const variants: ExperimentVariant[] = [
    { key: OPENING_MESSAGE_VARIANTS[0], label: "Gancho pessoal (atual)", weight: 100 - challengerWeight, isControl: true },
    { key: OPENING_MESSAGE_VARIANTS[1], label: "Pergunta direta", weight: challengerWeight, isControl: false, isExploration: true },
  ];

  db.insert(experiments)
    .values({ name, variable: "opening_message", status: "running", variants })
    .run();

  revalidatePath("/experimentos");
}

export async function setExperimentStatusAction(formData: FormData) {
  const id = Number(requireString(formData, "experimentId"));
  const status = requireString(formData, "status") as ExperimentStatus;
  if (!EXPERIMENT_STATUSES.includes(status)) {
    throw new Error("Status de experimento inválido");
  }

  db.update(experiments).set({ status }).where(eq(experiments.id, id)).run();

  revalidatePath("/experimentos");
}
