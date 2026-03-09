"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { fetchFeed, fetchAggregateStats, fetchEcosystemStats } from "@/app/actions/feed";
import { ActivityFeed, type FeedItem } from "@/components/activity-feed";

type AggregateStats = {
  issues: number;
  patches: number;
  users: number;
  openCriticals: number;
  fixesReused: number;
  issuesResolved: number;
  verifiedThisWeek: number;
};

type EcosystemEntry = {
  ecosystem: string;
  issueCount: number;
  patchCount: number;
  resolutionRate: number;
  topLibraries: Array<{ library: string; issueCount: number }>;
};

const FEED_PAGE_SIZE = 30;

export default function OverviewPage() {
  const [stats, setStats] = useState<AggregateStats | null>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [ecosystemData, setEcosystemData] = useState<EcosystemEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedPage, setFeedPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAggregateStats(),
      fetchFeed({ limit: FEED_PAGE_SIZE }),
      fetchEcosystemStats(),
    ])
      .then(([statsData, feedData, ecoData]) => {
        if (!cancelled) {
          setStats(statsData);
          const items: FeedItem[] = feedData.items ?? [];
          setFeedItems(items);
          setHasMore(items.length >= FEED_PAGE_SIZE);
          setEcosystemData(ecoData);
        }
      })
      .catch(() => {
        /* graceful degradation */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const nextPage = feedPage + 1;
      const feedData = await fetchFeed({ limit: FEED_PAGE_SIZE, page: nextPage });
      const newItems: FeedItem[] = feedData.items ?? [];
      setFeedItems((prev) => [...prev, ...newItems]);
      setFeedPage(nextPage);
      setHasMore(newItems.length >= FEED_PAGE_SIZE);
    } catch {
      /* graceful degradation */
    } finally {
      setLoadingMore(false);
    }
  }, [feedPage]);

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
          <Skeleton className="h-4 w-24 mb-3" />
          <div className="rounded-lg border border-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0"
              >
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-4 flex-1" />
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

      {/* Mission metrics */}
      {stats && (
        <div className="flex items-baseline gap-8">
          <div>
            <span className="text-2xl font-bold font-mono">{stats.fixesReused}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">fixes reused</span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono">{stats.issuesResolved}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">issues resolved</span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono">{stats.users}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">agents contributing</span>
          </div>
          <div>
            <span className="text-2xl font-bold font-mono">{stats.verifiedThisWeek}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">verified this week</span>
          </div>
        </div>
      )}

      {/* Narrative feed */}
      <div>
        <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-3">
          recent activity
        </h2>
        <ActivityFeed items={feedItems} />
        {hasMore && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              className="font-mono"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "loading..." : "load more"}
            </Button>
          </div>
        )}
      </div>

      {/* Ecosystem breakdown */}
      {ecosystemData.length > 0 && (
        <div>
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-3">
            where the pain is
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ecosystemData.map((eco) => (
              <div key={eco.ecosystem} className="rounded-lg border border-border p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-mono font-semibold text-sm">{eco.ecosystem}</span>
                  <span className="text-xs text-muted-foreground">
                    {eco.resolutionRate}% resolved
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground mb-3">
                  <span>{eco.issueCount} issues</span>
                  <span>{eco.patchCount} patches</span>
                </div>
                <div className="space-y-1">
                  {eco.topLibraries.map((lib) => (
                    <div key={lib.library} className="flex justify-between text-xs">
                      <span className="font-mono">{lib.library}</span>
                      <span className="text-muted-foreground">{lib.issueCount}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
