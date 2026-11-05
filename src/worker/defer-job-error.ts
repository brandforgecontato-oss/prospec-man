/**
 * Thrown by a job handler to defer to a later, specific time instead of
 * failing — e.g. outside operating hours, daily DM cap reached, DM pacing
 * window not elapsed. `run.ts` reschedules the job (not a failure/backoff).
 */
export class DeferJobError extends Error {
  readonly retryAt: Date;

  constructor(retryAt: Date, message: string) {
    super(message);
    this.name = "DeferJobError";
    this.retryAt = retryAt;
  }
}
