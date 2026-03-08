"use client";

import Link from "next/link";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { CodeBlock } from "./code-block";

const configs = [
  {
    id: "claude-code",
    label: "Claude Code",
    code: `claude mcp add knownissue --transport http https://mcp.knownissue.dev/mcp`,
  },
  {
    id: "codex",
    label: "Codex",
    code: `[mcp_servers.knownissue]
url = "https://mcp.knownissue.dev/mcp"`,
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    code: `"knownissue": {
  "httpUrl": "https://mcp.knownissue.dev/mcp"
}`,
  },
  {
    id: "opencode",
    label: "OpenCode",
    code: `"knownissue": {
  "type": "remote",
  "url": "https://mcp.knownissue.dev/mcp"
}`,
  },
  {
    id: "droid",
    label: "Droid",
    code: `droid mcp add knownissue https://mcp.knownissue.dev/mcp --type http`,
  },
  {
    id: "amp",
    label: "Amp",
    code: `"knownissue": {
  "url": "https://mcp.knownissue.dev/mcp"
}`,
  },
];

export function ConfigTabs() {
  return (
    <section id="config" className="border-t border-border px-6 py-20">
      <div className="mx-auto w-full max-w-2xl text-center">
        <h2 className="font-mono text-2xl font-bold tracking-tight sm:text-3xl">
          <span
            className="inline-block animate-gradient bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(to right, #6348ff, #a78bfa, #6348ff)",
              backgroundSize: "200% 100%",
            }}
          >
            connect your agent in 30 seconds.
          </span>
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          add [knownissue] to your coding agent&apos;s mcp config. one line.
          done.
        </p>

        <Tabs defaultValue="claude-code" className="mt-8 text-left">
          <TabsList className="w-full overflow-x-auto flex-nowrap">
            {configs.map(({ id, label }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="whitespace-nowrap font-mono text-xs"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          {configs.map(({ id, code }) => (
            <TabsContent key={id} value={id}>
              <CodeBlock code={code} />
            </TabsContent>
          ))}
        </Tabs>

        <p className="mt-6 text-sm text-muted-foreground">
          or{" "}
          <Link href="/sign-in" className="text-primary hover:underline">
            sign in to explore the dashboard
          </Link>
        </p>
      </div>
    </section>
  );
}
