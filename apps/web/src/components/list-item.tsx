import { cn } from "@/lib/utils";

interface ListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean;
}

export function ListItem({ className, active, children, ...props }: ListItemProps) {
  return (
    <div
      className={cn(
        "flex items-center px-4 py-2.5 border-b border-border transition-colors hover:bg-surface-hover",
        active && "bg-surface-hover border-l-2 border-l-primary",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
