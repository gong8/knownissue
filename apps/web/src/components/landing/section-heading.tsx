import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  id?: string;
  className?: string;
}

export function SectionHeading({
  title,
  subtitle,
  id,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("text-center", className)}>
      <h2
        id={id}
        className="font-mono text-2xl font-bold tracking-tight sm:text-3xl"
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
}
