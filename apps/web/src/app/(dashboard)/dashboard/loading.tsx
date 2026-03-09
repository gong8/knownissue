import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <PageHeader title="dashboard" />

      {/* Stats skeleton */}
      <div className="flex items-baseline gap-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-8 w-12" />
            <Skeleton className="mt-1 h-3 w-14" />
          </div>
        ))}
      </div>

      {/* Recent activity skeleton */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-14" />
        </div>
        <div className="rounded-lg border border-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden sm:block h-3 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
