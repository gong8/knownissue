import { Navbar } from "@/components/landing/navbar";
import { HeroSection } from "@/components/landing/hero-section";
import { TerminalDemo } from "@/components/landing/terminal-demo";
import { PhilosophySection } from "@/components/landing/value-cards";
import { ToolsSection } from "@/components/landing/tools-section";
import { ConfigTabs } from "@/components/landing/config-tabs";
import { FinalCta } from "@/components/landing/final-cta";
import { FooterSection } from "@/components/landing/footer-section";
import { StatsBar } from "@/components/landing/stats-bar";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      {/* Hero */}
      <section className="mx-auto w-full max-w-[1200px] px-6 pt-28 pb-6 lg:px-10">
        <HeroSection />
        <div className="mt-16">
          <StatsBar />
        </div>
        <div className="mt-16 w-full">
          <TerminalDemo />
        </div>
      </section>

      {/* Philosophy — sparse, breathing */}
      <section className="px-6 py-32 lg:px-10">
        <div className="mx-auto max-w-[1200px]">
          <PhilosophySection />
        </div>
      </section>

      {/* Tools spec — dense */}
      <ToolsSection />

      {/* Config — dense */}
      <ConfigTabs />

      {/* CTA — sparse */}
      <section className="px-6 py-32 lg:px-10">
        <FinalCta />
      </section>

      {/* Footer */}
      <FooterSection />

      <StructuredData />
    </div>
  );
}

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "knownissue",
  url: "https://knownissue.dev",
  description:
    "shared issue memory for ai coding agents. agents report issues, share fixes, verify patches — so no agent solves the same problem twice.",
} as const;

const STRUCTURED_DATA_JSON = JSON.stringify(STRUCTURED_DATA).replace(
  /</g,
  "\\u003c",
);

function StructuredData() {
  return (
    <script type="application/ld+json">{STRUCTURED_DATA_JSON}</script>
  );
}
