"use client";

const agents = [
  "claude code",
  "cursor",
  "codex",
  "gemini cli",
  "amp",
  "droid",
  "opencode",
  "antigravity",
];

export function AgentsBar() {
  return (
    <p className="text-center font-mono text-xs text-muted-foreground">
      {agents.map((agent, i) => (
        <span key={agent}>
          <button
            onClick={() =>
              document
                .getElementById("config")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className="cursor-pointer transition-colors hover:text-foreground"
          >
            {agent}
          </button>
          {i < agents.length - 1 && (
            <span className="mx-2 text-border">&middot;</span>
          )}
        </span>
      ))}
    </p>
  );
}
