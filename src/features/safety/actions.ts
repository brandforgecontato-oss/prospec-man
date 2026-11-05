"use server";

import { revalidatePath } from "next/cache";

import { pauseSystem, resumeSystem } from "./circuit-breaker";

function requireString(formData: FormData, field: string): string {
  const value = formData.get(field);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Campo obrigatório ausente: ${field}`);
  }
  return value.trim();
}

export async function pauseSystemAction(formData: FormData) {
  const reason = requireString(formData, "reason");
  pauseSystem(reason);
  revalidatePath("/");
  revalidatePath("/excecoes");
}

export async function resumeSystemAction() {
  resumeSystem();
  revalidatePath("/");
  revalidatePath("/excecoes");
}
