export interface WorkerConfig {
  pollIntervalMs: number;
  maxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  /** "Crescimento anormal de erro" circuit-breaker trigger (safety/error-rate.ts): trips after this many dead-letter jobs inside errorRateWindowMs. */
  errorRateThreshold: number;
  errorRateWindowMs: number;
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadWorkerConfig(): WorkerConfig {
  return {
    pollIntervalMs: readIntEnv("WORKER_POLL_INTERVAL_MS", 5_000),
    maxAttempts: readIntEnv("JOB_MAX_ATTEMPTS", 5),
    backoffBaseMs: readIntEnv("JOB_BACKOFF_BASE_MS", 30_000),
    backoffMaxMs: readIntEnv("JOB_BACKOFF_MAX_MS", 3_600_000),
    errorRateThreshold: readIntEnv("JOB_ERROR_RATE_THRESHOLD", 5),
    errorRateWindowMs: readIntEnv("JOB_ERROR_RATE_WINDOW_MS", 15 * 60_000),
  };
}
