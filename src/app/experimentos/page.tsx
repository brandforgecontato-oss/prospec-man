export const dynamic = "force-dynamic";

import {
  createOpeningMessageExperimentAction,
  setExperimentStatusAction,
} from "@/features/experiments/actions";
import { listExperimentsWithMetrics, REPORTED_MILESTONES } from "@/features/experiments/queries";
import {
  EXPERIMENT_STATUS_LABELS,
  EXPERIMENT_STATUS_TONE,
  PIPELINE_STAGE_LABELS,
} from "@/features/leads/labels";
import { Badge } from "@/components/badge";

function formatPct(conversions: number, sampleSize: number): string {
  if (sampleSize === 0) return "—";
  return `${((conversions / sampleSize) * 100).toFixed(0)}%`;
}

export default function ExperimentosPage() {
  const experiments = listExperimentsWithMetrics();

  return (
    <main className="flex flex-col gap-8">
      <div>
        <p className="mb-1 text-xs font-medium tracking-[0.14em] text-gold-deep uppercase">
          Otimização contínua
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">Experimentos</h1>
        <p className="mt-1 max-w-2xl text-sm text-body">
          Teste A/B da mensagem inicial: uma variável por vez, com grupo de
          controle e distribuição que só se move depois que cada variante
          acumula amostra suficiente — nunca declara vencedor cedo.
        </p>
      </div>

      <form
        action={createOpeningMessageExperimentAction}
        className="flex max-w-xl flex-col gap-4 rounded-lg border border-line bg-paper p-6"
      >
        <h2 className="font-display text-lg font-semibold text-ink">Novo experimento — mensagem inicial</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Nome *</span>
          <input
            type="text"
            name="name"
            required
            placeholder="ex.: pergunta direta vs. gancho pessoal"
            className="rounded border border-line bg-cream px-3 py-2 text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">% do tráfego na variante desafiante (&quot;pergunta direta&quot;)</span>
          <input
            type="number"
            name="challengerWeight"
            required
            min={1}
            max={99}
            defaultValue={20}
            className="rounded border border-line bg-cream px-3 py-2 text-ink"
          />
        </label>
        <button
          type="submit"
          className="mt-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream hover:bg-gold-deep"
        >
          Iniciar experimento
        </button>
      </form>

      <section className="flex flex-col gap-6">
        {experiments.length === 0 ? (
          <p className="text-sm text-body">Nenhum experimento cadastrado ainda.</p>
        ) : (
          experiments.map(({ experiment, variants, metrics }) => (
            <div key={experiment.id} className="rounded-lg border border-line bg-paper p-5">
              <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink">{experiment.name}</h3>
                  <p className="mt-1 flex items-center gap-2 text-sm text-body">
                    <span>
                      Variável: {experiment.variable} · Amostra mínima por variante: {experiment.minSampleSize}
                    </span>
                    <Badge tone={EXPERIMENT_STATUS_TONE[experiment.status]}>
                      {EXPERIMENT_STATUS_LABELS[experiment.status]}
                    </Badge>
                  </p>
                </div>
                <form action={setExperimentStatusAction} className="flex gap-2">
                  <input type="hidden" name="experimentId" value={experiment.id} />
                  {experiment.status !== "paused" && (
                    <button
                      type="submit"
                      name="status"
                      value="paused"
                      className="rounded border border-line px-3 py-1 text-sm text-body hover:border-gold-deep hover:text-gold-deep"
                    >
                      Pausar
                    </button>
                  )}
                  {experiment.status !== "running" && (
                    <button
                      type="submit"
                      name="status"
                      value="running"
                      className="rounded border border-line px-3 py-1 text-sm text-body hover:border-gold-deep hover:text-gold-deep"
                    >
                      Retomar
                    </button>
                  )}
                  {experiment.status !== "concluded" && (
                    <button
                      type="submit"
                      name="status"
                      value="concluded"
                      className="rounded border border-line px-3 py-1 text-sm text-body hover:border-gold-deep hover:text-gold-deep"
                    >
                      Concluir
                    </button>
                  )}
                </form>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold tracking-[0.06em] text-gold-deep uppercase">
                      <th className="py-1 pr-4">Variante</th>
                      <th className="py-1 pr-4">Peso atual</th>
                      <th className="py-1 pr-4">Amostra</th>
                      {REPORTED_MILESTONES.map((stage) => (
                        <th key={stage} className="py-1 pr-4">
                          {PIPELINE_STAGE_LABELS[stage]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((variant) => {
                      const variantMetrics = metrics.find((m) => m.key === variant.key);
                      const sampleSize = variantMetrics?.sampleSize ?? 0;
                      return (
                        <tr key={variant.key} className="border-t border-line">
                          <td className="py-2 pr-4 font-medium text-ink">
                            {variant.label}
                            {variant.isControl && (
                              <span className="ml-1 text-xs text-body">(controle)</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-ink">{variant.weight}%</td>
                          <td className="py-2 pr-4 text-ink">{sampleSize}</td>
                          {REPORTED_MILESTONES.map((stage) => (
                            <td key={stage} className="py-2 pr-4 text-ink">
                              {formatPct(variantMetrics?.conversionsByMilestone[stage] ?? 0, sampleSize)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
