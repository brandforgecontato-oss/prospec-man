export const dynamic = "force-dynamic";

import Link from "next/link";

import { pauseSystemAction, resumeSystemAction } from "@/features/safety/actions";
import {
  getSystemState,
  listDeadLetterJobs,
  listHumanReviewLeads,
  listRecentIntegrationAlerts,
  readOperationalLimits,
} from "@/features/safety/queries";
import {
  CHANNEL_STATE_LABELS,
  EVENT_TYPE_LABELS,
  JOB_TYPE_LABELS,
} from "@/features/leads/labels";
import { formatCurrencyUsd, formatDateTime } from "@/lib/format";

export default function ExcecoesPage() {
  const systemState = getSystemState();
  const deadLetterJobs = listDeadLetterJobs();
  const humanReviewLeads = listHumanReviewLeads();
  const alerts = listRecentIntegrationAlerts();
  const limits = readOperationalLimits();

  return (
    <main className="flex flex-col gap-8">
      <div>
        <p className="mb-1 text-xs font-medium tracking-[0.14em] text-gold-deep uppercase">
          Segurança e confiabilidade
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">Segurança e exceções</h1>
        <p className="mt-1 max-w-2xl text-sm text-body">
          Botão de pausa geral, fila de exceções, alertas de integração e os
          limites operacionais em vigor (só leitura — vêm do .env).
        </p>
      </div>

      <section
        className={`rounded-lg border p-4 ${
          systemState.paused ? "border-ember/30 bg-ember-soft" : "border-line bg-paper"
        }`}
      >
        {systemState.paused ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-ember">Sistema pausado</h2>
              <p className="text-sm text-ember">
                {systemState.pausedReason} · desde {formatDateTime(systemState.pausedAt)}
              </p>
            </div>
            <form action={resumeSystemAction}>
              <button
                type="submit"
                className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream hover:bg-gold-deep"
              >
                Retomar sistema
              </button>
            </form>
          </div>
        ) : (
          <div>
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Pausa geral</h2>
            <p className="mb-3 text-sm text-body">
              O worker para de processar qualquer job assim que pausado. Use
              em caso de comportamento inesperado — a fila fica intacta,
              nada se perde.
            </p>
            <form action={pauseSystemAction} className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                name="reason"
                required
                placeholder="Motivo da pausa"
                className="flex-1 rounded border border-line bg-cream px-3 py-2 text-sm text-ink"
              />
              <button
                type="submit"
                className="rounded-md border border-ember/40 px-4 py-2 text-sm font-medium text-ember hover:bg-ember-soft"
              >
                Pausar sistema
              </button>
            </form>
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-paper p-4">
          <h2 className="mb-3 border-b border-line pb-2 font-display text-lg font-semibold text-ink">
            Jobs em dead-letter
          </h2>
          {deadLetterJobs.length === 0 ? (
            <p className="text-sm text-body">Nenhum job morto no momento.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {deadLetterJobs.map((job) => (
                <li key={job.id} className="border-t border-line pt-2 first:border-t-0 first:pt-0">
                  <div className="flex justify-between">
                    <span className="font-medium text-ink">{JOB_TYPE_LABELS[job.type]}</span>
                    <span className="text-body">{formatDateTime(job.updatedAt)}</span>
                  </div>
                  {job.leadId && (
                    <Link href={`/leads/${job.leadId}`} className="text-gold-deep hover:underline">
                      Ver lead
                    </Link>
                  )}
                  {job.lastError && <p className="text-body">{job.lastError}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-line bg-paper p-4">
          <h2 className="mb-3 border-b border-line pb-2 font-display text-lg font-semibold text-ink">
            Leads em revisão humana
          </h2>
          {humanReviewLeads.length === 0 ? (
            <p className="text-sm text-body">Nenhum lead aguardando revisão.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {humanReviewLeads.map((lead) => (
                <li key={lead.id} className="flex justify-between border-t border-line pt-2 first:border-t-0 first:pt-0">
                  <Link href={`/leads/${lead.id}`} className="font-medium text-gold-deep hover:underline">
                    @{lead.instagramUsername}
                  </Link>
                  <span className="text-body">{CHANNEL_STATE_LABELS[lead.channelState]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-paper p-4">
        <h2 className="mb-3 border-b border-line pb-2 font-display text-lg font-semibold text-ink">
          Alertas de integração recentes
        </h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-body">Nenhum alerta recente.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {alerts.map((event) => (
              <li key={event.id} className="flex justify-between border-t border-line pt-2 first:border-t-0 first:pt-0">
                <span className="text-ink">
                  {EVENT_TYPE_LABELS[event.type]}
                  {event.leadId && (
                    <>
                      {" "}
                      ·{" "}
                      <Link href={`/leads/${event.leadId}`} className="text-gold-deep hover:underline">
                        lead #{event.leadId}
                      </Link>
                    </>
                  )}
                </span>
                <span className="text-body">{formatDateTime(event.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-line bg-paper p-4">
        <h2 className="mb-3 border-b border-line pb-2 font-display text-lg font-semibold text-ink">
          Limites operacionais (.env)
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-body">DMs por dia</dt>
            <dd className="font-medium text-ink">{limits.maxDmsPerDay ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-body">Intervalo entre DMs</dt>
            <dd className="font-medium text-ink">
              {limits.minSecondsBetweenDms && limits.maxSecondsBetweenDms
                ? `${limits.minSecondsBetweenDms}–${limits.maxSecondsBetweenDms}s`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-body">Janela de operação</dt>
            <dd className="font-medium text-ink">{limits.operatingHours ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-body">Fuso horário</dt>
            <dd className="font-medium text-ink">{limits.operatingTimezone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-body">Orçamento mensal de IA</dt>
            <dd className="font-medium text-ink">
              {limits.openAiMonthlyBudgetUsd !== null
                ? formatCurrencyUsd(limits.openAiMonthlyBudgetUsd)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-body">Tentativas por job</dt>
            <dd className="font-medium text-ink">{limits.jobMaxAttempts}</dd>
          </div>
          <div>
            <dt className="text-body">Pausa automática por erro</dt>
            <dd className="font-medium text-ink">
              {limits.errorRateThreshold} dead-letter / {Math.round(limits.errorRateWindowMs / 60_000)} min
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
