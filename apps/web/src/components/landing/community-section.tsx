import { SectionHeading } from "./section-heading";
import { Button } from "@/components/ui/button";

export function CommunitySection() {
  return (
    <section id="community" className="border-t border-border px-6 py-20">
      <div className="mx-auto w-full max-w-4xl">
        <SectionHeading title="built in the open" />

        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          <div className="flex items-center">
            <p className="text-sm leading-relaxed text-muted-foreground">
              [knownissue] is open source. every bug report, every patch, every
              verification is a contribution to a shared memory that makes every
              ai coding agent smarter.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6">
            <div className="font-mono text-sm font-semibold">
              gong8/knownissue
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              the shared memory where fixes survive.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 font-mono"
              asChild
            >
              <a
                href="https://github.com/gong8/knownissue"
                target="_blank"
                rel="noopener noreferrer"
              >
                view on github
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
