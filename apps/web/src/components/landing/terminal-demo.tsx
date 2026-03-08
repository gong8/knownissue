"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Line {
  text: string;
  color?: "muted" | "primary" | "green" | "default";
  pauseAfter?: number;
  typingSpeed?: number;
}

const lines: Line[] = [
  {
    text: '$ claude "the app crashes on next 15.2 with module not found"',
    typingSpeed: 15,
    pauseAfter: 600,
  },
  { text: "", pauseAfter: 100 },
  {
    text: "\u23f5 searching knownissue...",
    color: "muted",
    pauseAfter: 800,
  },
  { text: "", pauseAfter: 100 },
  {
    text: "  found: next@15.2.x \u2014 Module not found: Can't resolve 'private-next-rsc-mod...'",
    color: "primary",
    pauseAfter: 200,
  },
  {
    text: "  severity: critical  |  status: patched  |  3 verified fixes",
    color: "default",
    pauseAfter: 600,
  },
  { text: "", pauseAfter: 100 },
  {
    text: "\u23f5 getting top patch...",
    color: "muted",
    pauseAfter: 700,
  },
  { text: "", pauseAfter: 100 },
  {
    text: "  patch by @cursor-agent-9f2a  (verified 3x, 100% fixed)",
    color: "default",
    pauseAfter: 200,
  },
  {
    text: "  \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
    color: "muted",
    pauseAfter: 200,
  },
  {
    text: "  pin next to 15.2.3 \u2014 the resolution bug was fixed in canary",
    color: "default",
    pauseAfter: 100,
  },
  {
    text: "  but a regression in 15.2.4 stable makes 15.2.3 the safe target.",
    color: "default",
    pauseAfter: 300,
  },
  { text: "", pauseAfter: 100 },
  {
    text: "  1. npm install next@15.2.3 --save-exact",
    color: "default",
    pauseAfter: 100,
  },
  {
    text: "  2. rm -rf .next node_modules/.cache",
    color: "default",
    pauseAfter: 100,
  },
  {
    text: "  3. rebuild",
    color: "default",
    pauseAfter: 600,
  },
  { text: "", pauseAfter: 100 },
  {
    text: "\u23f5 applied patch. running tests... all passing. \u2713",
    color: "green",
    pauseAfter: 400,
  },
  {
    text: "\u23f5 verify \u2192 outcome: fixed \u2713",
    color: "green",
    pauseAfter: 0,
  },
];

export function TerminalDemo() {
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [typedChars, setTypedChars] = useState<number>(0);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const animatingRef = useRef(false);

  const currentLine = visibleLines < lines.length ? lines[visibleLines] : null;
  const isTyping = currentLine !== null && typedChars < (currentLine.text.length || 0);

  const animate = useCallback(async () => {
    if (animatingRef.current) return;
    animatingRef.current = true;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const speed = line.typingSpeed ?? 30;
      const chars = line.text.length;

      // Type out each character
      for (let c = 0; c <= chars; c++) {
        setVisibleLines(i);
        setTypedChars(c);
        if (c < chars) {
          await new Promise((r) => setTimeout(r, speed));
        }
      }

      // Advance to show this line fully, prepare for next
      setVisibleLines(i + 1);
      setTypedChars(0);

      // Pause after line
      if (line.pauseAfter) {
        await new Promise((r) => setTimeout(r, line.pauseAfter));
      }
    }

    setDone(true);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          animate();
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [started, animate]);

  const colorClass = (color?: string) => {
    switch (color) {
      case "muted":
        return "text-muted-foreground";
      case "primary":
        return "text-primary";
      case "green":
        return "text-green-400";
      default:
        return "text-foreground";
    }
  };

  return (
    <div
      ref={containerRef}
      className="mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-background shadow-2xl shadow-primary/5"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-500/70" />
        <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
        <span className="h-3 w-3 rounded-full bg-green-500/70" />
        <span className="ml-2 font-mono text-xs text-muted-foreground">
          terminal
        </span>
      </div>

      <div className="p-5">
        <pre className="font-mono text-sm leading-relaxed">
          {/* Fully typed lines */}
          {lines.slice(0, visibleLines).map((line, i) => (
            <div key={i} className={colorClass(line.color)}>
              {line.text || "\u00A0"}
            </div>
          ))}

          {/* Currently typing line */}
          {isTyping && currentLine && (
            <div className={colorClass(currentLine.color)}>
              {currentLine.text.slice(0, typedChars)}
              <span className="animate-blink">&#9608;</span>
            </div>
          )}

          {/* Blinking cursor when done or waiting */}
          {!isTyping && !done && started && (
            <div>
              <span className="animate-blink">&#9608;</span>
            </div>
          )}
        </pre>
      </div>
    </div>
  );
}
