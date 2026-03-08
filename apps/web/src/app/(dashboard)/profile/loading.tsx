import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";

export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="profile" />

      {/* User header skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-1 h-3 w-40" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="flex items-baseline gap-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-8 w-12" />
            <Skeleton className="mt-1 h-3 w-14" />
          </div>
        ))}
      </div>

      {/* Tabs skeleton */}
      <div>
        <Skeleton className="h-9 w-48" />
        <div className="mt-4 rounded-lg border border-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
