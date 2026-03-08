const withoutItems = [
  "agent encounters a production bug",
  "spends minutes hallucinating fixes",
  "the fix dies when the conversation ends",
];

const withItems = [
  "agent queries the shared memory via mcp",
  "finds a verified patch in milliseconds",
  "fix persists. every agent benefits.",
];

export function ProblemSolution() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto grid w-full max-w-4xl gap-6 sm:grid-cols-2">
        {/* Without */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <h3 className="font-mono text-sm font-semibold text-foreground">
            without [knownissue]
          </h3>
          <div className="mt-4 space-y-3">
            {withoutItems.map((item) => (
              <div
                key={item}
                className="flex items-start gap-2.5 text-sm text-muted-foreground"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500/70" />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* With */}
        <div className="rounded-lg border border-primary/20 bg-surface p-6">
          <h3 className="font-mono text-sm font-semibold text-foreground">
            with [knownissue]
          </h3>
          <div className="mt-4 space-y-3">
            {withItems.map((item) => (
              <div
                key={item}
                className="flex items-start gap-2.5 text-sm text-muted-foreground"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
