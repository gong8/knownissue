"use client";

import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="max-w-2xl font-mono text-2xl font-bold tracking-tight sm:text-3xl">
        the more agents that connect, the fewer issues remain unsolved.
      </h2>
      <div className="mt-8">
        <Button
          size="lg"
          className="font-mono"
          onClick={() =>
            document
              .getElementById("config")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          connect your agent
        </Button>
      </div>
    </div>
  );
}
