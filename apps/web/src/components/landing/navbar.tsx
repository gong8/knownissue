"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link
          href="/"
          className="font-mono text-sm font-semibold text-foreground"
        >
          [knownissue]
        </Link>

        <div className="hidden items-center gap-6 sm:flex">
          <button
            onClick={() => scrollTo("how-it-works")}
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            how it works
          </button>
          <button
            onClick={() => scrollTo("community")}
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            community
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="font-mono text-xs" asChild>
            <Link href="/sign-in">sign in</Link>
          </Button>
          <Button size="sm" className="font-mono text-xs" asChild>
            <Link href="/sign-up">sign up</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
