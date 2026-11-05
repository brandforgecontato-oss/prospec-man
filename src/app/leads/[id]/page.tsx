import { notFound } from "next/navigation";

import { LEAD_CHANNEL_STATES, LEAD_PIPELINE_STAGES } from "@/db/schema";
import {
  addNoteAction,
  setNextActionAction,
  updateChannelStateAction,
  updatePipelineStageAction,
} from "@/features/leads/actions";
import {
  CHANNEL_STATE_LABELS,
  CHANNEL_STATE_TONE,
  DECISION_MAKER_LABELS,
  EVENT_TYPE_LABELS,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_TONE,
} from "@/features/leads/labels";
import { getLeadById, getLeadTimeline } from "@/features/leads/queries";
import type { EventType } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/badge";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const leadId = Number(id);
  const lead = getLeadById(leadId);
  if (!lead) notFound();

  const timeline = getLeadTimeline(leadId);
  const nextActionAtInputValue = lead.nextActionAt
    ? lead.nextActionAt.slice(0, 16)
    : "";

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">
          {lead.fullName ?? `@${lead.instagramUsername}`}
        </h1>
        <p className="mt-1 flex items-center gap-2 text-body">
          <span>@{lead.instagramUsername} · {DECISION_MAKER_LABELS[lead.decisionMakerType]}</span>
        </p>
        <div className="mt-3 flex gap-2">
          <Badge tone={PIPELINE_STAGE_TONE[lead.pipelineStage]}>
            {PIPELINE_STAGE_LABELS[lead.pipelineStage]}
          </Badge>
          <Badge tone={CHANNEL_STATE_TONE[lead.channelState]}>
            {CHANNEL_STATE_LABELS[lead.channelState]}
          </Badge>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-1">
          <div className="rounded-lg border border-line bg-paper p-4">
            <h2 className="mb-2 font-display text-base font-semibold text-ink">Etapa do funil</h2>
            <form action={updatePipelineStageAction} className="flex gap-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <select
                name="pipelineStage"
                defaultValue={lead.pipelineStage}
                className="w-full rounded border border-line bg-cream px-2 py-1 text-sm text-ink"
              >
                {LEAD_PIPELINE_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {PIPELINE_STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="shrink-0 rounded border border-line px-3 text-sm text-body hover:border-gold-deep hover:text-gold-deep"
              >
                Salvar
              </button>
            </form>
          </div>

          <div className="rounded-lg border border-line bg-paper p-4">
            <h2 className="mb-2 font-display text-base font-semibold text-ink">Estado do canal</h2>
            <form action={updateChannelStateAction} className="flex gap-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <select
                name="channelState"
                defaultValue={lead.channelState}
                className="w-full rounded border border-line bg-cream px-2 py-1 text-sm text-ink"
              >
                {LEAD_CHANNEL_STATES.map((state) => (
                  <option key={state} value={state}>
                    {CHANNEL_STATE_LABELS[state]}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="shrink-0 rounded border border-line px-3 text-sm text-body hover:border-gold-deep hover:text-gold-deep"
              >
                Salvar
              </button>
            </form>
          </div>

          <div className="rounded-lg border border-line bg-paper p-4">
            <h2 className="mb-2 font-display text-base font-semibold text-ink">Próxima ação</h2>
            <form action={setNextActionAction} className="flex flex-col gap-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-body">Data e hora</span>
                <input
                  type="datetime-local"
                  name="nextActionAt"
                  defaultValue={nextActionAtInputValue}
                  className="rounded border border-line bg-cream px-2 py-1 text-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-body">O que fazer</span>
                <input
                  type="text"
                  name="nextActionNote"
                  defaultValue={lead.nextActionNote ?? ""}
                  className="rounded border border-line bg-cream px-2 py-1 text-ink"
                />
              </label>
              <button
                type="submit"
                className="rounded border border-line px-3 py-1 text-sm text-body hover:border-gold-deep hover:text-gold-deep"
              >
                Salvar
              </button>
            </form>
          </div>

          {lead.bio && (
            <div className="rounded-lg border border-line bg-paper p-4">
              <h2 className="mb-2 font-display text-base font-semibold text-ink">Bio</h2>
              <p className="text-sm text-body">{lead.bio}</p>
            </div>
          )}

          {lead.notes && (
            <div className="rounded-lg border border-line bg-paper p-4">
              <h2 className="mb-2 font-display text-base font-semibold text-ink">Observações do cadastro</h2>
              <p className="text-sm text-body">{lead.notes}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="rounded-lg border border-line bg-paper p-4">
            <h2 className="mb-2 font-display text-base font-semibold text-ink">Adicionar nota</h2>
            <form action={addNoteAction} className="flex gap-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <input
                type="text"
                name="note"
                required
                placeholder="Escreva uma nota para o histórico deste lead"
                className="w-full rounded border border-line bg-cream px-3 py-2 text-sm text-ink"
              />
              <button
                type="submit"
                className="shrink-0 rounded bg-ink px-4 py-2 text-sm font-medium text-cream hover:bg-gold-deep"
              >
                Adicionar
              </button>
            </form>
          </div>

          <div className="rounded-lg border border-line bg-paper p-4">
            <h2 className="mb-3 border-b border-line pb-2 font-display text-base font-semibold text-ink">
              Histórico
            </h2>
            {timeline.length === 0 ? (
              <p className="text-sm text-body">
                Nenhum evento ou mensagem registrado ainda.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {timeline.map((entry) => (
                  <li key={entry.id} className="border-b border-line pb-3 last:border-0">
                    <div className="flex items-center justify-between text-xs text-body">
                      <span>
                        {entry.kind === "message"
                          ? entry.summary
                          : EVENT_TYPE_LABELS[entry.summary as EventType] ??
                            entry.summary}
                      </span>
                      <span>{formatDateTime(entry.createdAt)}</span>
                    </div>
                    {entry.detail && (
                      <p className="mt-1 text-sm text-ink">{entry.detail}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
