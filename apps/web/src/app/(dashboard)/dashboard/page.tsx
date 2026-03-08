"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FileCode } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ListItem } from "@/components/list-item";
import { Skeleton } from "@/components/ui/skeleton";
import { useListKeyboard } from "@/hooks/use-list-keyboard";
import { fetchUserStats } from "@/app/actions/user";
import { fetchBugs } from "@/app/actions/bugs";
import { relativeTime } from "@/lib/helpers";
import type { Severity, Bug } from "@knownissue/shared";

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-zinc-400",
};

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<{
    credits: number;
    bugsReported: number;
    patchesSubmitted: number;
    reviewsGiven: number;
  } | null>(null);
  const [recentBugs, setRecentBugs] = useState<Bug[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchUserStats(),
      fetchBugs({ limit: 5 }),
    ])
      .then(([statsData, bugsData]) => {
        if (!cancelled) {
          setStats(statsData);
          setRecentBugs(bugsData.bugs ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStats(null);
          setRecentBugs([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleSelect = useCallback(
    (index: number) => {
      const bug = recentBugs[index];
      if (bug) router.push(`/bugs/${bug.id}`);
    },
    [recentBugs, router]
  );

  const { focusedIndex } = useListKeyboard({
    itemCount: recentBugs.length,
    onSelect: handleSelect,
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="dashboard" />
        <div className="flex items-baseline gap-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-8 w-12" />
              <Skeleton className="mt-1 h-3 w-14" />
            </div>
          ))}
        </div>
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

  return (
    <div className="space-y-6">
      <PageHeader title="dashboard" />

      {/* Inline metrics row */}
      {stats && (
        <div className="flex items-baseline gap-8">
          <div>
            <span className="text-2xl font-bold font-mono">{stats.credits}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">credits</span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono">{stats.bugsReported}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">bugs</span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono">{stats.patchesSubmitted}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">patches</span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono">{stats.reviewsGiven}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">reviews</span>
          </div>
        </div>
      )}

      {/* Recent bugs */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
            recent bugs
          </h2>
          <Link
            href="/bugs"
            className="text-xs font-mono text-primary hover:underline"
          >
            view all
          </Link>
        </div>

        <div className="rounded-lg border border-border">
          {recentBugs.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <p className="text-sm font-mono">no bugs yet.</p>
            </div>
          ) : (
            recentBugs.map((bug, i) => (
              <Link key={bug.id} href={`/bugs/${bug.id}`}>
                <ListItem active={focusedIndex === i} className="gap-3 cursor-pointer">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[bug.severity]}`} />
                  <span className="flex-1 truncate text-sm font-medium">{bug.title}</span>
                  <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                    {bug.library}@{bug.version}
                  </span>
                  {bug.patches && bug.patches.length > 0 && (
                    <span className="hidden shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground sm:inline-flex">
                      <FileCode className="h-3 w-3" />
                      {bug.patches.length}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(new Date(bug.createdAt))}
                  </span>
                </ListItem>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
