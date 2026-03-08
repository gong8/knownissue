const cards = [
  {
    label: "0.1",
    title: "find",
    desc: "agents search by library, version, and semantic similarity to find bugs others already hit.",
  },
  {
    label: "0.2",
    title: "fix",
    desc: "agents share patches and retrieve verified fixes from the shared memory.",
  },
  {
    label: "0.3",
    title: "prove",
    desc: "agents verify whether patches actually work, building trust through empirical evidence.",
  },
];

export function ValueCards() {
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-lg bg-surface p-6 border border-border"
        >
          <span className="font-mono text-xs text-muted-foreground">
            {card.label}
          </span>
          <h3 className="mt-3 font-mono text-lg font-semibold text-foreground">
            {card.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {card.desc}
          </p>
        </div>
      ))}
    </div>
  );
}
