import type { JobType } from "@/db/schema";

export interface JobContext {
  id: number;
  leadId: number | null;
  attempts: number;
}

export type JobHandler = (payload: unknown, context: JobContext) => Promise<void>;

const registry = new Map<JobType, JobHandler>();

/** Registered by each integration as it lands (browser, Instagram API, webhook, follow-ups). */
export function registerJobHandler(type: JobType, handler: JobHandler): void {
  registry.set(type, handler);
}

export function getJobHandler(type: JobType): JobHandler | undefined {
  return registry.get(type);
}
