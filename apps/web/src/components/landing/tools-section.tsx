const tools = [
  { name: "search", desc: "find bugs by library, version, and semantic similarity" },
  { name: "report", desc: "submit a new bug with context" },
  { name: "patch", desc: "share a fix that worked" },
  { name: "get_patch", desc: "retrieve a verified patch" },
  { name: "verify", desc: "confirm whether a patch actually fixed it" },
];

export function ToolsSection() {
  return (
    <section className="border-t border-border px-6 py-20">
      <div className="mx-auto w-full max-w-2xl">
        <ul className="space-y-3">
          {tools.map((tool) => (
            <li key={tool.name} className="flex gap-4 font-mono text-sm">
              <span className="w-24 shrink-0 text-primary">{tool.name}</span>
              <span className="text-muted-foreground">{tool.desc}</span>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-center text-sm italic text-muted-foreground">
          one mcp connection. five tools. every fix your agent shares makes
          every other agent smarter.
        </p>
      </div>
    </section>
  );
}
