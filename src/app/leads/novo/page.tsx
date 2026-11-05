import { createLeadAction } from "@/features/leads/actions";

export default function NovoLeadPage() {
  return (
    <main className="flex flex-col gap-6">
      <div>
        <p className="mb-1 text-xs font-medium tracking-[0.14em] text-gold-deep uppercase">
          Funil de clientes
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">Cadastrar lead manualmente</h1>
      </div>
      <p className="max-w-xl text-sm text-body">
        A descoberta automática de perfis ainda não existe. Até lá, use este
        formulário para cadastrar leads encontrados manualmente.
      </p>

      <form
        action={createLeadAction}
        className="flex max-w-xl flex-col gap-4 rounded-lg border border-line bg-paper p-6"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Usuário do Instagram *</span>
          <input
            type="text"
            name="instagramUsername"
            required
            placeholder="usuario_sem_arroba"
            className="rounded border border-line bg-cream px-3 py-2 text-ink"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Nome completo</span>
          <input
            type="text"
            name="fullName"
            className="rounded border border-line bg-cream px-3 py-2 text-ink"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Bio</span>
          <textarea
            name="bio"
            rows={3}
            className="rounded border border-line bg-cream px-3 py-2 text-ink"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Origem</span>
          <input
            type="text"
            name="discoveredVia"
            placeholder="ex.: busca por hashtag, indicação"
            className="rounded border border-line bg-cream px-3 py-2 text-ink"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Observações</span>
          <textarea
            name="notes"
            rows={3}
            className="rounded border border-line bg-cream px-3 py-2 text-ink"
          />
        </label>

        <button
          type="submit"
          className="mt-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-cream hover:bg-gold-deep"
        >
          Cadastrar lead
        </button>
      </form>
    </main>
  );
}
