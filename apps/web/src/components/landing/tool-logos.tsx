const tools = [
  { name: "Claude Code", logo: "/logos/claude-code.svg" },
  { name: "Codex", logo: "/logos/codex.svg" },
  { name: "Gemini CLI", logo: "/logos/gemini-cli.svg" },
  { name: "OpenCode", logo: "/logos/opencode.svg" },
  { name: "Droid", logo: "/logos/droid.svg" },
  { name: "Amp", logo: "/logos/amp.svg" },
];

export function ToolLogos() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-10">
      {tools.map(({ name, logo }) => (
        <div
          key={name}
          className="flex flex-col items-center gap-2 grayscale transition-all duration-300 hover:grayscale-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={name} width={40} height={40} className="h-10 w-10" />
          <span className="font-mono text-xs text-muted-foreground">
            {name}
          </span>
        </div>
      ))}
    </div>
  );
}
