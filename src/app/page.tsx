import Link from "next/link";

import { LEAD_PIPELINE_STAGES } from "@/db/schema";

export const dynamic = "force-dynamic";
import { getDashboardStats } from "@/features/leads/queries";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_TONE,
  PIPELINE_STAGE_LABELS,
} from "@/features/leads/labels";
import { getSystemState } from "@/features/safety/queries";
import { getBusinessConfig } from "@/lib/business-config";
import { formatCurrencyUsd, formatDateTime } from "@/lib/format";
import { Badge } from "@/components/badge";

export default function Home() {
  const stats = getDashboardStats();
  const business = getBusinessConfig();
  const systemState = getSystemState();

  const stageCountByStage = new Map(
    stats.stageCounts.map((row) => [row.stage, row.count]),
  );
  const jobCountByStatus = new Map(
    stats.jobStatusCounts.map((row) => [row.status, row.count]),
  );

  return (
    <main className="flex flex-col gap-10">
      {systemState.paused && (
        <div className="rounded-lg border border-ember/30 bg-ember-soft p-4 text-sm text-ember">
          <span className="font-semibold">Sistema pausado:</span> {systemState.pausedReason}{" "}
          — <Link href="/excecoes" className="underline underline-offset-2">retomar em Segurança</Link>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-medium tracking-[0.14em] text-gold-deep uppercase">
          {business.companyName}
        </p>
        <h1 className="font-display text-3xl font-semibold text-ink">Painel de prospecção</h1>
        <p className="mt-1 text-body">
          {stats.totalLeads} lead{stats.totalLeads === 1 ? "" : "s"} no funil de clientes
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {LEAD_PIPELINE_STAGES.map((stage) => (
          <div key={stage} className="rounded-lg border border-line bg-paper p-4">
            <div className="font-display text-3xl font-semibold text-ink">
              {stageCountByStage.get(stage) ?? 0}
            </div>
            <div className="mt-1 text-sm text-body">{PIPELINE_STAGE_LABELS[stage]}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-paper p-5">
          <h2 className="mb-3 border-b border-line pb-2 font-display text-lg font-semibold text-ink">
            Follow-ups vencidos
          </h2>
          {stats.overdueFollowUps.length === 0 ? (
            <p className="text-sm text-body">Nenhum follow-up vencido.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {stats.overdueFollowUps.map((lead) => (
                <li key={lead.id} className="text-sm">
                  <Link href={`/leads/${lead.id}`} className="font-medium text-ink hover:text-gold-deep">
                    @{lead.instagramUsername}
                  </Link>{" "}
                  <span className="text-body">
                    — vencido em {formatDateTime(lead.nextActionAt)}
                    {lead.nextActionNote ? ` · ${lead.nextActionNote}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-line bg-paper p-5">
          <h2 className="mb-3 border-b border-line pb-2 font-display text-lg font-semibold text-ink">
            Fila de jobs
          </h2>
          {stats.jobStatusCounts.length === 0 ? (
            <p className="text-sm text-body">
              Nenhum job registrado ainda — o worker chega na próxima etapa.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {Object.entries(JOB_STATUS_LABELS).map(([status, label]) => (
                <li key={status} className="flex items-center justify-between">
                  <Badge tone={JOB_STATUS_TONE[status as keyof typeof JOB_STATUS_TONE]}>
                    {label}
                  </Badge>
                  <span className="font-medium text-ink">
                    {jobCountByStatus.get(status as never) ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {stats.deadLetterJobs.length > 0 && (
            <p className="mt-3 text-sm text-ember">
              {stats.deadLetterJobs.length} job(s) em dead-letter precisam de revisão.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-paper p-5">
          <h2 className="mb-3 border-b border-line pb-2 font-display text-lg font-semibold text-ink">
            Custo de IA
          </h2>
          <div className="font-display text-3xl font-semibold text-ink">
            {formatCurrencyUsd(stats.totalAiCostUsd)}
          </div>
          <p className="text-sm text-body">Total acumulado em chamadas de IA.</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-body">Por lead</dt>
              <dd className="font-medium text-ink">{formatCurrencyUsd(stats.costPerLeadUsd)}</dd>
            </div>
            <div>
              <dt className="text-body">Por cliente ativo</dt>
              <dd className="font-medium text-ink">
                {stats.costPerActiveCustomerUsd === null
                  ? "—"
                  : formatCurrencyUsd(stats.costPerActiveCustomerUsd)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-line bg-paper p-5">
          <h2 className="mb-3 border-b border-line pb-2 font-display text-lg font-semibold text-ink">
            Atalhos
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              <a
                href={`https://instagram.com/${business.instagramHandle.replace(/^@/, "")}`}
                target="_blank"
                rel="noreferrer"
                className="text-gold-deep hover:underline"
              >
                Instagram {business.instagramHandle}
              </a>
            </li>
            <li>
              <a
                href={business.whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="text-gold-deep hover:underline"
              >
                WhatsApp da BrandForge
              </a>
            </li>
            {business.affiliateGroupLink && (
              <li>
                <a
                  href={business.affiliateGroupLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gold-deep hover:underline"
                >
                  Grupo de afiliados
                </a>
              </li>
            )}
          </ul>
        </div>
      </section>
    </main>
  );
}
