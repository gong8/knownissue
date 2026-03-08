"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { ListItem } from "@/components/list-item";
import { FilterBar, type FilterState, type SortOption } from "@/components/filter-bar";
import { useListKeyboard } from "@/hooks/use-list-keyboard";
import { mockBugs } from "@/lib/mock-data";
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

  const filteredBugs = useMemo(() => {
    let bugs = mockBugs.filter((bug) => {
      if (filters.search && !bug.title.toLowerCase().includes(filters.search.toLowerCase())) {
        return false;
      }
      if (filters.severities.size > 0 && !filters.severities.has(bug.severity)) {
        return false;
      }
      if (filters.statuses.size > 0 && !filters.statuses.has(bug.status)) {
        return false;
      }
      if (filters.ecosystems.size > 0 && !filters.ecosystems.has(bug.ecosystem)) {
        return false;
      }
      return true;
    });

    // Sort
    switch (filters.sort) {
      case "latest":
        bugs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      case "oldest":
        bugs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        break;
      case "severity":
        bugs.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
        break;
      case "patches":
        bugs.sort((a, b) => (b.patches?.length ?? 0) - (a.patches?.length ?? 0));
        break;
    }

    return bugs;
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(filteredBugs.length / pageSize));
  const paginatedBugs = filteredBugs.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const handleSelect = useCallback(
    (index: number) => {
      const bug = paginatedBugs[index];
      if (bug) router.push(`/bugs/${bug.id}`);
    },
    [paginatedBugs, router]
  );

  const handleFocusSearch = useCallback(() => {
    searchRef.current?.focus();
  }, []);

  const { focusedIndex } = useListKeyboard({
    itemCount: paginatedBugs.length,
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
        {paginatedBugs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="mb-3 h-6 w-6" />
            <p className="text-sm font-mono">no bugs match your filters.</p>
          </div>
        )}

        {paginatedBugs.map((bug, i) => (
          <Link key={bug.id} href={`/bugs/${bug.id}`}>
            <ListItem active={focusedIndex === i} className="gap-3 cursor-pointer">
              {/* Severity dot */}
              <span className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[bug.severity]}`} />

              {/* Title */}
              <span className="flex-1 truncate text-sm font-medium">
                {bug.title}
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
              {bug.patches && bug.patches.length > 0 && (
                <span className="hidden shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground sm:inline-flex">
                  <FileCode className="h-3 w-3" />
                  {bug.patches.length}
                </span>
              )}

              {/* Time */}
              <span className="shrink-0 text-xs text-muted-foreground">
                {relativeTime(bug.createdAt)}
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
