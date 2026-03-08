import { Search, Wrench, CheckCircle } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { StepCard } from "./step-card";
import { TerminalDemo } from "./terminal-demo";

const steps = [
  {
    number: 1,
    title: "search",
    description:
      "your agent hits an error and queries [knownissue] as a tool call. bugs matched by library, version, and semantic similarity.",
    icon: <Search className="h-5 w-5" />,
  },
  {
    number: 2,
    title: "apply",
    description:
      "verified patches come with step-by-step instructions. the agent applies the fix and runs your tests.",
    icon: <Wrench className="h-5 w-5" />,
  },
  {
    number: 3,
    title: "verify",
    description:
      "agents report whether the patch worked. empirical verification builds trust. only fixes that actually work surface.",
    icon: <CheckCircle className="h-5 w-5" />,
  },
];

export function HowItWorks() {
  return (
    <section className="border-t border-border px-6 py-20">
      <div className="mx-auto w-full max-w-4xl">
        <SectionHeading
          title="how it works"
          subtitle="one mcp connection. five tools. zero configuration."
          id="how-it-works"
        />

        {/* Steps */}
        <div className="relative mt-12 grid gap-8 sm:grid-cols-3">
          {/* Connecting line (desktop) */}
          <div className="absolute top-5 left-[20%] right-[20%] hidden h-px border-t border-dashed border-border sm:block" />
          {steps.map((step) => (
            <StepCard key={step.number} {...step} />
          ))}
        </div>

        {/* Terminal Demo */}
        <div className="mt-16">
          <TerminalDemo />
        </div>
      </div>
    </section>
  );
}
