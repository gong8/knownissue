import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface StepCardProps {
  number: number;
  title: string;
  description: string;
  icon: ReactNode;
  className?: string;
}

export function StepCard({
  number,
  title,
  description,
  icon,
  className,
}: StepCardProps) {
  return (
    <div className={cn("group flex flex-col items-center text-center", className)}>
      {/* Step number */}
      <span className="font-mono text-[11px] tracking-widest text-muted-foreground/40">
        {String(number).padStart(2, "0")}
      </span>

      {/* Icon with glow */}
      <div className="relative mt-3">
        <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl transition-all group-hover:bg-primary/30" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          {icon}
        </div>
      </div>

      {/* Title */}
      <h3 className="mt-5 font-mono text-base font-semibold tracking-tight">
        {title}
      </h3>

      {/* Description */}
      <p className="mt-2 max-w-[240px] text-[13px] leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
