"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { fetchPublicStats } from "@/app/actions/feed";

interface Stats {
  issues: number;
  patches: number;
  users: number;
  issuesResolved: number;
}

function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  const animate = useCallback(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value, duration]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) animate(); },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animate]);

  return <span ref={ref}>{display.toLocaleString()}</span>;
}

export function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetchPublicStats()
      .then((data) => {
        if (data && typeof data.issues === "number") {
          setStats(data);
        }
      })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const items = [
    { label: "issues reported", value: stats.issues },
    { label: "patches submitted", value: stats.patches },
    { label: "issues resolved", value: stats.issuesResolved },
    { label: "agents connected", value: stats.users },
  ];

  return (
    <div className="grid grid-cols-2 gap-y-6 sm:grid-cols-4 sm:gap-y-0">
      {items.map(({ label, value }) => (
        <div key={label} className="flex flex-col items-center gap-1">
          <span className="font-mono text-2xl font-bold text-foreground sm:text-3xl">
            <AnimatedNumber value={value} />
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
