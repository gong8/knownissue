"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchFeed, fetchAggregateStats } from "@/app/actions/feed";
import { ActivityFeed, type FeedItem } from "@/components/activity-feed";

export default function DashboardPage() {
  const [stats, setStats] = useState<{
    issues: number;
    patches: number;
    approvalRate: number;
    openCriticals: number;
  } | null>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAggregateStats(),
      fetchFeed({ limit: 10 }),
    ])
      .then(([statsData, feedData]) => {
        if (!cancelled) {
          setStats(statsData);
          setFeedItems(feedData.items ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStats(null);
          setFeedItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="overview" />
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
      <PageHeader title="overview" />

      {/* Aggregate metrics row */}
      {stats && (
        <div className="flex items-baseline gap-8">
          <div>
            <span className="text-2xl font-bold font-mono">{stats.issues}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">issues tracked</span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono">{stats.patches}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">patches</span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono">{stats.approvalRate}%</span>
            <span className="ml-1.5 text-xs text-muted-foreground">approval rate</span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono">{stats.openCriticals}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">open criticals</span>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
            recent activity
          </h2>
          <Link
            href="/activity"
            className="text-xs font-mono text-primary hover:underline"
          >
            view all
          </Link>
        </div>

        <ActivityFeed items={feedItems} />
      </div>
    </div>
  );
}
