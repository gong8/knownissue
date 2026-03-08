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
    <div className={cn("flex flex-col items-center text-center", className)}>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-primary">
        {icon}
      </div>
      <div className="mt-3 font-mono text-xs text-muted-foreground">
        step {number}
      </div>
      <h3 className="mt-1 font-mono text-sm font-semibold">{title}</h3>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
