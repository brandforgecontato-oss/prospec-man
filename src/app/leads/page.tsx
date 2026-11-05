import Link from "next/link";

import { LEAD_PIPELINE_STAGES } from "@/db/schema";

export const dynamic = "force-dynamic";
import { updatePipelineStageAction } from "@/features/leads/actions";
import {
  CHANNEL_STATE_LABELS,
  CHANNEL_STATE_TONE,
  PIPELINE_STAGE_LABELS,
} from "@/features/leads/labels";
import { listLeadsByStage } from "@/features/leads/queries";
import { Badge } from "@/components/badge";

export default function LeadsPage() {
  const leadsByStage = listLeadsByStage();

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="mb-1 text-xs font-medium tracking-[0.14em] text-gold-deep uppercase">
            Funil de clientes
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">Leads</h1>
        </div>
        <Link
          href="/leads/novo"
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream hover:bg-gold-deep"
        >
          Novo lead
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {LEAD_PIPELINE_STAGES.map((stage) => {
          const stageLeads = leadsByStage.get(stage) ?? [];
          return (
            <div key={stage} className="flex w-72 shrink-0 flex-col gap-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="text-xs font-semibold tracking-[0.08em] text-gold-deep uppercase">
                  {PIPELINE_STAGE_LABELS[stage]}
                </span>
                <span className="rounded-full bg-ink/8 px-2 py-0.5 text-xs font-medium text-body">
                  {stageLeads.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="rounded-lg border border-line bg-paper p-3 shadow-sm"
                  >
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-medium text-ink hover:text-gold-deep"
                    >
                      {lead.fullName ?? `@${lead.instagramUsername}`}
                    </Link>
                    <div className="text-xs text-body">@{lead.instagramUsername}</div>
                    <div className="mt-2">
                      <Badge tone={CHANNEL_STATE_TONE[lead.channelState]}>
                        {CHANNEL_STATE_LABELS[lead.channelState]}
                      </Badge>
                    </div>
                    <form
                      action={updatePipelineStageAction}
                      className="mt-3 flex gap-1"
                    >
                      <input type="hidden" name="leadId" value={lead.id} />
                      <select
                        name="pipelineStage"
                        defaultValue={stage}
                        className="w-full rounded border border-line bg-cream px-2 py-1 text-xs text-ink"
                      >
                        {LEAD_PIPELINE_STAGES.map((option) => (
                          <option key={option} value={option}>
                            {PIPELINE_STAGE_LABELS[option]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="shrink-0 rounded border border-line px-2 text-xs text-body hover:border-gold-deep hover:text-gold-deep"
                      >
                        Mover
                      </button>
                    </form>
                  </div>
                ))}
                {stageLeads.length === 0 && (
                  <p className="text-xs text-body/70">Sem leads nesta etapa.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
