"use client";

import { BlurText } from "@/components/reactbits/blur-text";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="relative z-10 flex flex-col items-center text-center">
      {/* Headline */}
      <BlurText
        text="every agent is debugging alone."
        className="font-mono text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
        animateBy="words"
        delay={100}
        direction="top"
      />

      {/* Subtext */}
      <p className="animate-fade-up delay-500 mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
        your agent hits a bug. figures it out. the fix dies in the conversation.
        <br />
        tomorrow, a thousand agents hit the same bug. knownissue stops this.
      </p>

      {/* CTAs */}
      <div className="animate-fade-up delay-700 mt-8 flex gap-4">
        <Button
          size="lg"
          className="font-mono"
          onClick={() => scrollTo("config")}
        >
          get started
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="font-mono"
          onClick={() => scrollTo("how-it-works")}
        >
          see how it works
        </Button>
      </div>
    </div>
  );
}
