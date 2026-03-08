"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { fetchFeed } from "@/app/actions/feed";
import { ActivityFeed, type FeedItem } from "@/components/activity-feed";
import { cn } from "@/lib/utils";

const ACTION_TYPES = ["bugs", "patches", "verifications"] as const;
const SEVERITIES = ["critical", "high", "medium", "low"] as const;
const ECOSYSTEMS = ["node", "python", "go", "rust", "other"] as const;
const TIME_RANGES = [
  { label: "today", value: "today" },
  { label: "this week", value: "week" },
  { label: "this month", value: "month" },
  { label: "all time", value: "" },
] as const;

const PAGE_SIZE = 20;

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 font-mono text-xs transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

export default function ActivityPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [ecosystemFilter, setEcosystemFilter] = useState<string>("");
  const [rangeFilter, setRangeFilter] = useState<string>("");

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      // Map filter type names to API values
      const typeMap: Record<string, string> = {
        bugs: "bug",
        patches: "patch",
        verifications: "verification",
      };
      const data = await fetchFeed({
        type: typeMap[typeFilter] ?? typeFilter,
        severity: severityFilter,
        ecosystem: ecosystemFilter,
        range: rangeFilter,
        page,
        limit: PAGE_SIZE,
      });
      setItems(data.items ?? []);
      setHasMore((data.items ?? []).length === PAGE_SIZE);
    } catch {
      setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, severityFilter, ecosystemFilter, rangeFilter, page]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  function toggleFilter(
    current: string,
    value: string,
    setter: (v: string) => void,
  ) {
    setter(current === value ? "" : value);
    setPage(1);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="activity" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <div className="rounded-lg border border-border">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="activity" />

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {ACTION_TYPES.map((t) => (
          <FilterChip
            key={t}
            label={t}
            active={typeFilter === t}
            onClick={() => toggleFilter(typeFilter, t, setTypeFilter)}
          />
        ))}
        <span className="mx-1 border-r border-border" />
        {SEVERITIES.map((s) => (
          <FilterChip
            key={s}
            label={s}
            active={severityFilter === s}
            onClick={() => toggleFilter(severityFilter, s, setSeverityFilter)}
          />
        ))}
        <span className="mx-1 border-r border-border" />
        {ECOSYSTEMS.map((e) => (
          <FilterChip
            key={e}
            label={e}
            active={ecosystemFilter === e}
            onClick={() => toggleFilter(ecosystemFilter, e, setEcosystemFilter)}
          />
        ))}
        <span className="mx-1 border-r border-border" />
        {TIME_RANGES.map((r) => (
          <FilterChip
            key={r.label}
            label={r.label}
            active={rangeFilter === r.value}
            onClick={() => toggleFilter(rangeFilter, r.value, setRangeFilter)}
          />
        ))}
      </div>

      {/* Feed */}
      <ActivityFeed items={items} />

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          className="font-mono"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          prev
        </Button>
        <span className="font-mono text-xs text-muted-foreground">page {page}</span>
        <Button
          variant="outline"
          size="sm"
          className="font-mono"
          disabled={!hasMore}
          onClick={() => setPage((p) => p + 1)}
        >
          next
        </Button>
      </div>
    </div>
  );
}
