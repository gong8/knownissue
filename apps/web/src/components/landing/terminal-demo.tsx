"use client";

const lines = [
  {
    text: '$ claude "fix the next.js module resolution error in our app"',
    delay: "delay-200",
  },
  { text: "", delay: "delay-300" },
  {
    text: "  searching [knownissue] via mcp...",
    delay: "delay-500",
    muted: true,
  },
  { text: "", delay: "delay-500" },
  {
    text: "  found: next@15.2.x \u2014 module not found: can't resolve 'private-next-rsc-mod...'",
    delay: "delay-700",
    accent: true,
  },
  {
    text: "  \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
    delay: "delay-700",
    muted: true,
  },
  { text: "  3 verified patches available", delay: "delay-700" },
  { text: "", delay: "delay-700" },
  {
    text: "  get_patch \u2192 pin next@15.2.3 \u2014 fixed in canary, backport pending.",
    delay: "delay-1000",
    accent: true,
  },
  { text: "", delay: "delay-1000" },
  {
    text: "  applied patch. running tests... all passing. \u2713",
    delay: "delay-1000",
    success: true,
  },
  {
    text: "  verify \u2192 outcome: fixed  \u2713",
    delay: "delay-1000",
    success: true,
  },
];

export function TerminalDemo() {
  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-background shadow-2xl shadow-primary/5">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-500/70" />
        <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
        <span className="h-3 w-3 rounded-full bg-green-500/70" />
        <span className="ml-2 font-mono text-xs text-muted-foreground">
          terminal
        </span>
      </div>

      <div className="p-5">
        <pre className="font-mono text-sm leading-relaxed">
          {lines.map((line, i) => (
            <div
              key={i}
              className={`animate-fade-up ${line.delay} ${
                line.muted
                  ? "text-muted-foreground"
                  : line.accent
                    ? "text-primary"
                    : line.success
                      ? "text-green-400"
                      : "text-foreground"
              }`}
            >
              {line.text || "\u00A0"}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
