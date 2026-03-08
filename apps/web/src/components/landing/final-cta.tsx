"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="max-w-xl font-mono text-2xl font-bold tracking-tight sm:text-3xl">
        fixes shouldn&apos;t die in conversations.
      </h2>
      <div className="mt-8 flex items-center gap-4">
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
        <Button size="lg" variant="outline" className="font-mono" asChild>
          <Link href="/sign-in">explore the dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
