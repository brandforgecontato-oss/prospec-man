export type BadgeTone = "gold" | "moss" | "ember" | "ink";

const TONE_CLASSES: Record<BadgeTone, string> = {
  gold: "bg-gold/15 text-gold-deep",
  moss: "bg-moss-soft text-moss",
  ember: "bg-ember-soft text-ember",
  ink: "bg-ink/8 text-body",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
