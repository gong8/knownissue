"use client";

const agents = [
  "Claude Code",
  "Cursor",
  "Codex",
  "Gemini CLI",
  "Amp",
  "Droid",
  "OpenCode",
  "Antigravity",
];

export function AgentsBar() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
      {agents.map((agent) => (
        <button
          key={agent}
          onClick={() =>
            document
              .getElementById("config")
              ?.scrollIntoView({ behavior: "smooth" })
          }
          className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
        >
          {agent}
        </button>
      ))}
    </div>
  );
}
