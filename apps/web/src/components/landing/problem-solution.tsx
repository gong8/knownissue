import { X, Check, ArrowRight } from "lucide-react";

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
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
          {/* Without */}
          <div className="group relative w-full rounded-xl border border-border/50 bg-surface/50 p-8 transition-colors hover:border-border">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
                <X className="h-4 w-4 text-red-400" />
              </div>
              <h3 className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
                without [knownissue]
              </h3>
            </div>
            <div className="space-y-4">
              {withoutItems.map((item, i) => (
                <div key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 font-mono text-xs text-red-400/40">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Arrow divider */}
          <div className="hidden shrink-0 sm:block">
            <ArrowRight className="h-4 w-4 text-muted-foreground/30" />
          </div>

          {/* With */}
          <div className="group relative w-full overflow-hidden rounded-xl border border-primary/20 bg-surface/50 p-8 transition-colors hover:border-primary/40">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent" />
            <div className="relative">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Check className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
                  with [knownissue]
                </h3>
              </div>
              <div className="space-y-4">
                {withItems.map((item, i) => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 font-mono text-xs text-primary/40">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="text-sm leading-relaxed text-foreground/80">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
