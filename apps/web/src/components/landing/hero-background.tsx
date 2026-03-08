"use client";

import dynamic from "next/dynamic";

const Squares = dynamic(
  () =>
    import("@/components/reactbits/squares").then((m) => ({
      default: m.Squares,
    })),
  { ssr: false }
);

export function HeroBackground() {
  return (
    <div className="absolute inset-0 z-0">
      <div className="h-full w-full opacity-30">
        <Squares
          direction="diagonal"
          speed={0.3}
          borderColor="rgba(255, 255, 255, 0.04)"
          squareSize={48}
          hoverFillColor="rgba(99, 72, 255, 0.06)"
          fadeColor="hsl(0 0% 7%)"
        />
      </div>
    </div>
  );
}
