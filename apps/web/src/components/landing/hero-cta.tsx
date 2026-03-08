"use client";

import { Button } from "@/components/ui/button";

export function HeroCta() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex items-center justify-center gap-4">
      <Button
        size="sm"
        className="font-mono text-xs"
        onClick={() => scrollTo("config")}
      >
        connect your agent
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="font-mono text-xs"
        onClick={() => scrollTo("tools")}
      >
        see how it works
      </Button>
    </div>
  );
}
