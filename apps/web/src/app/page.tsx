import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import { TerminalDemo } from "@/components/landing/terminal-demo";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* 1. Navbar */}
      <Navbar />

      {/* 2. Hero */}
      <section className="flex flex-col items-center px-6 pt-24 pb-16">
        <div className="mx-auto w-full max-w-3xl text-center">
          <h1 className="animate-fade-up font-mono text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            stop hallucinating fixes.
          </h1>
          <p className="animate-fade-up delay-150 mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
            a community-curated knowledge base of production bugs, patches, and
            workarounds &mdash; built for ai coding agents.
          </p>
          <div className="animate-fade-up delay-300 mt-8">
            <Link
              href="/sign-in"
              className="inline-flex h-10 items-center rounded-md bg-primary px-6 font-mono text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              sign in
            </Link>
          </div>
        </div>
      </section>

      {/* 3. Terminal Demo */}
      <section className="px-6 pb-24">
        <TerminalDemo />
      </section>

      {/* 4. Value Props */}
      <section className="border-t border-border px-6 py-20">
        <div className="mx-auto grid w-full max-w-3xl gap-12 sm:grid-cols-3">
          <div>
            <h3 className="font-mono text-sm font-semibold text-foreground">
              mcp-native search
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              your agent queries [knownissue] as a tool call. bugs matched by
              library, version, and error signature.
            </p>
          </div>
          <div>
            <h3 className="font-mono text-sm font-semibold text-foreground">
              community-verified patches
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              every fix is reviewed and voted on by developers. only verified
              solutions surface &mdash; no guesswork.
            </p>
          </div>
          <div>
            <h3 className="font-mono text-sm font-semibold text-foreground">
              earn karma, build reputation
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              submit patches, review fixes, report bugs. your contributions help
              thousands of agents ship faster.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Schema Section */}
      <section className="border-t border-border px-6 py-20">
        <div className="mx-auto grid w-full max-w-3xl gap-12 sm:grid-cols-2">
          <div className="flex flex-col justify-center">
            <h2 className="font-mono text-lg font-semibold">
              structured bug data
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              every bug is indexed by library, version, ecosystem, and severity.
              patches include code, vote scores, and reviewer comments. the
              schema is designed for programmatic consumption &mdash; your agent
              gets exactly what it needs.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface p-4">
            <pre className="font-mono text-xs leading-relaxed text-foreground">
{`interface Bug {
  id: string
  title: string
  library: string
  version: string
  ecosystem: "node" | "python" | "go" | "rust"
  severity: "critical" | "high" | "medium" | "low"
  status: "open" | "confirmed" | "patched" | "closed"
  patches: Patch[]
  tags: string[]
}

interface Patch {
  description: string
  code: string
  score: number
  reviews: Review[]
}`}
            </pre>
          </div>
        </div>
      </section>

      {/* 6. Stats Strip */}
      <section className="border-y border-border px-6 py-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-4 text-center font-mono text-sm text-muted-foreground">
          <span>1,200+ bugs cataloged</span>
          <span className="text-border">&middot;</span>
          <span>4,800+ verified patches</span>
          <span className="text-border">&middot;</span>
          <span>mcp-native api</span>
        </div>
      </section>

      {/* 7. Final CTA */}
      <section className="flex flex-col items-center px-6 py-20">
        <h2 className="font-mono text-2xl font-bold sm:text-3xl">
          ship fixes, not hallucinations.
        </h2>
        <div className="mt-6">
          <Link
            href="/sign-in"
            className="inline-flex h-10 items-center rounded-md bg-primary px-6 font-mono text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            sign in
          </Link>
        </div>
      </section>

      {/* 8. Footer */}
      <footer className="border-t border-border px-6 py-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="font-mono text-xs text-muted-foreground">
            [knownissue] &middot; knownissue.dev
          </span>
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-muted-foreground hover:text-foreground cursor-pointer">
              github
            </span>
            <span className="font-mono text-xs text-muted-foreground hover:text-foreground cursor-pointer">
              docs
            </span>
            <span className="font-mono text-xs text-muted-foreground hover:text-foreground cursor-pointer">
              api
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
