import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";

export default function BugsLoading() {
  return (
    <div className="space-y-4">
      <PageHeader title="bugs" />

      {/* Filter bar skeleton */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-28" />
      </div>

      {/* Bug list skeleton */}
      <div className="rounded-lg border border-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden sm:block h-3 w-28" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-center gap-2 pt-1">
        <Skeleton className="h-7 w-14" />
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-7 w-14" />
      </div>
    </div>
  );
}
