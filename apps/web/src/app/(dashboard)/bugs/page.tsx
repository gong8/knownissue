"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { ListItem } from "@/components/list-item";
import { FilterBar, type FilterState } from "@/components/filter-bar";
import { useListKeyboard } from "@/hooks/use-list-keyboard";
import { relativeTime } from "@/lib/helpers";
import type { Severity, BugStatus } from "@knownissue/shared";

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-zinc-400",
};

const STATUS_COLOR: Record<BugStatus, string> = {
  open: "text-blue-400",
  confirmed: "text-purple-400",
  patched: "text-green-400",
  closed: "text-zinc-400",
};

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type ApiBug = {
  id: string;
  title: string | null;
  errorMessage?: string | null;
  library: string;
  version: string;
  ecosystem: string;
  severity: Severity;
  status: BugStatus;
  tags: string[];
  score: number;
  createdAt: string;
  updatedAt: string;
  reporter?: { githubUsername: string; avatarUrl?: string };
  _count?: { patches: number };
  patches?: unknown[];
};

export default function BugsPage() {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    severities: new Set(),
    statuses: new Set(),
    ecosystems: new Set(),
    sort: "latest",
  });
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [bugs, setBugs] = useState<ApiBug[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { fetchBugs } = await import("@/app/actions/bugs");
        const params: Record<string, string | number> = {
          page,
          limit: pageSize,
        };
        if (filters.search) params.q = filters.search;
        if (filters.severities.size > 0) params.severity = [...filters.severities].join(",");
        if (filters.statuses.size > 0) params.status = [...filters.statuses].join(",");
        if (filters.ecosystems.size > 0) params.ecosystem = [...filters.ecosystems].join(",");
        const data = await fetchBugs(params);
        if (!cancelled) {
          setBugs(data.bugs ?? []);
          setTotal(data.total ?? 0);
        }
      } catch {
        if (!cancelled) {
          setBugs([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [filters.search, filters.severities, filters.statuses, filters.ecosystems, page]);

  // Client-side sort (API returns by latest)
  const sortedBugs = useMemo(() => {
    const list = [...bugs];
    switch (filters.sort) {
      case "oldest":
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "severity":
        list.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
        break;
      case "patches":
        list.sort((a, b) => (b._count?.patches ?? b.patches?.length ?? 0) - (a._count?.patches ?? a.patches?.length ?? 0));
        break;
      // "latest" is the default from API
    }
    return list;
  }, [bugs, filters.sort]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.severities, filters.statuses, filters.ecosystems]);

  const handleSelect = useCallback(
    (index: number) => {
      const bug = sortedBugs[index];
      if (bug) router.push(`/bugs/${bug.id}`);
    },
    [sortedBugs, router]
  );

  const handleFocusSearch = useCallback(() => {
    searchRef.current?.focus();
  }, []);

  const { focusedIndex } = useListKeyboard({
    itemCount: sortedBugs.length,
    onSelect: handleSelect,
    onFocusSearch: handleFocusSearch,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="bugs"
        actions={
          <Button asChild size="sm">
            <Link href="/bugs/new">report bug</Link>
          </Button>
        }
      />

      <FilterBar ref={searchRef} filters={filters} onFiltersChange={setFilters} />

      {/* Bug list */}
      <div className="rounded-lg border border-border">
        {loading && (
          <div>
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
        )}
        {!loading && sortedBugs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="mb-3 h-6 w-6" />
            <p className="text-sm font-mono">no bugs match your filters.</p>
          </div>
        )}

        {sortedBugs.map((bug, i) => (
          <Link key={bug.id} href={`/bugs/${bug.id}`}>
            <ListItem active={focusedIndex === i} className="gap-3 cursor-pointer">
              {/* Severity dot */}
              <span className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[bug.severity]}`} />

              {/* Score */}
              <span className="shrink-0 font-mono text-xs text-muted-foreground w-6 text-right">
                {bug.score}
              </span>

              {/* Title */}
              <span className="flex-1 truncate text-sm font-medium">
                {bug.title ?? bug.errorMessage ?? "Untitled"}
              </span>

              {/* Library@version */}
              <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                {bug.library}@{bug.version}
              </span>

              {/* Status */}
              <span className={`shrink-0 font-mono text-xs ${STATUS_COLOR[bug.status]}`}>
                {bug.status}
              </span>

              {/* Patches count */}
              {(bug._count?.patches ?? 0) > 0 && (
                <span className="hidden shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground sm:inline-flex">
                  <FileCode className="h-3 w-3" />
                  {bug._count?.patches}
                </span>
              )}

              {/* Time */}
              <span className="shrink-0 text-xs text-muted-foreground">
                {relativeTime(new Date(bug.createdAt))}
              </span>
            </ListItem>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-2 pt-1">
        <Button
          variant="outline"
          size="xs"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="font-mono"
        >
          prev
        </Button>
        <span className="font-mono text-xs text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="xs"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="font-mono"
        >
          next
        </Button>
      </div>
    </div>
  );
}
