import "@/features/campaigns/register";
import "@/features/conversations/register";

import { isSystemPaused } from "@/features/safety/circuit-breaker";
import { checkErrorRateAndMaybePause } from "@/features/safety/error-rate";

import { loadWorkerConfig, type WorkerConfig } from "./config";
import { DeferJobError } from "./defer-job-error";
import { getJobHandler } from "./handlers";
import { claimNextJob, completeJob, failJob, rescheduleJob, requeueOrphanedJobs } from "./queue";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processOneJob(config: WorkerConfig): Promise<boolean> {
  if (isSystemPaused()) return false;

  const job = claimNextJob();
  if (!job) return false;

  const handler = getJobHandler(job.type);
  if (!handler) {
    const error = new Error(`Sem handler registrado para o job "${job.type}"`);
    console.error(`[worker] job ${job.id}: ${error.message}`);
    failJob(job.id, job.attempts, error, config);
    return true;
  }

  console.log(`[worker] executando job ${job.id} (${job.type}), tentativa ${job.attempts}`);
  try {
    await handler(job.payload, { id: job.id, leadId: job.leadId, attempts: job.attempts });
    completeJob(job.id);
    console.log(`[worker] job ${job.id} concluído`);
  } catch (error) {
    if (error instanceof DeferJobError) {
      console.log(`[worker] job ${job.id} adiado: ${error.message}`);
      rescheduleJob(job.id, error.retryAt);
      return true;
    }
    console.error(`[worker] job ${job.id} falhou:`, error);
    const outcome = failJob(job.id, job.attempts, error, config);
    if (outcome === "dead_letter") {
      checkErrorRateAndMaybePause(config.errorRateThreshold, config.errorRateWindowMs);
    }
  }
  return true;
}

async function main() {
  const config = loadWorkerConfig();
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] recebido ${signal}, encerrando após a job atual...`);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const requeued = requeueOrphanedJobs();
  if (requeued > 0) {
    console.log(`[worker] ${requeued} job(s) presos em "running" de uma execução anterior foram reenfileirados`);
  }

  console.log(`[worker] iniciado — poll a cada ${config.pollIntervalMs}ms`);

  while (!shuttingDown) {
    const worked = await processOneJob(config);
    if (!worked) {
      await sleep(config.pollIntervalMs);
    }
  }

  console.log("[worker] encerrado.");
}

main().catch((error) => {
  console.error("[worker] erro fatal:", error);
  process.exit(1);
});
