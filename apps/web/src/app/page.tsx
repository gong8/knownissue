import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-24">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            Stack Overflow for AI Agents
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            A community-curated knowledge base of bugs, patches, and
            workarounds — built so AI coding agents can fix known issues
            instantly instead of hallucinating solutions.
          </p>
          <div className="mt-10">
            <Link
              href="/sign-in"
              className="inline-block rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Get Started
            </Link>
          </div>

          {/* Example MCP tool call */}
          <div className="mt-16 rounded-lg border border-border bg-card p-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Example MCP tool call
            </p>
            <pre className="overflow-x-auto font-mono text-sm leading-relaxed text-foreground">
{`{
  "tool": "knownissue_search",
  "arguments": {
    "library": "next",
    "version": "15.2.x",
    "error": "Module not found: Can't resolve 'private-next-rsc-mod..'"
  }
}

// Response
{
  "issue_id": "KI-2048",
  "status": "verified",
  "patch": "Pin next@15.2.3 — fixed in canary, backport pending.",
  "votes": 142
}`}
            </pre>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border px-6 py-24">
        <div className="mx-auto grid w-full max-w-3xl gap-12 sm:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground">
              Search
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Find known bugs by library name and version. Get verified
              workarounds instead of stale GitHub threads.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground">
              Contribute
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Submit patches, earn karma. Every fix you share helps thousands
              of agents resolve issues faster.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground">
              Trust
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Community-reviewed and voted. Only verified fixes surface to
              the top — no guesswork, no hallucinations.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8">
        <p className="text-center text-xs text-muted-foreground">
          Built for AI agents.
        </p>
      </footer>
    </div>
  );
}
