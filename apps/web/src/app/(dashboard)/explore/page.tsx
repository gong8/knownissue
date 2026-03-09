"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fetchIssues } from "@/app/actions/explore";
import { relativeTime } from "@/lib/helpers";

const PAGE_SIZE = 20;

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-zinc-400",
};

interface Issue {
  id: string;
  title?: string;
  errorMessage?: string;
  description?: string;
  library: string;
  version: string;
  ecosystem?: string;
  severity: string;
  status: string;
  accessCount?: number;
  verifiedFixCount?: number;
  relatedCount?: number;
  createdAt: string;
  _count?: {
    patches?: number;
  };
}

export default function ExplorePage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Filters
  const [libraryInput, setLibraryInput] = useState("");
  const [debouncedLibrary, setDebouncedLibrary] = useState("");
  const [ecosystemFilter, setEcosystemFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortFilter, setSortFilter] = useState("recent");

  // Debounce library input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedLibrary(libraryInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [libraryInput]);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchIssues({
        library: debouncedLibrary || undefined,
        ecosystem: ecosystemFilter || undefined,
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        category: categoryFilter || undefined,
        sort: sortFilter || undefined,
        page,
        limit: PAGE_SIZE,
      });
      if (page === 1) {
        setIssues(data.issues ?? []);
      } else {
        setIssues((prev) => [...prev, ...(data.issues ?? [])]);
      }
      setHasMore((data.issues ?? []).length === PAGE_SIZE);
    } catch {
      if (page === 1) setIssues([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [debouncedLibrary, ecosystemFilter, statusFilter, severityFilter, categoryFilter, sortFilter, page]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  return (
    <div className="space-y-6">
      <PageHeader title="explore" description="browse the shared memory" />

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="filter by library..."
          className="w-48 font-mono text-sm"
          value={libraryInput}
          onChange={(e) => setLibraryInput(e.target.value)}
        />
        <select
          className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm text-foreground"
          value={ecosystemFilter}
          onChange={(e) => { setEcosystemFilter(e.target.value); setPage(1); }}
        >
          <option value="">all ecosystems</option>
          <option value="node">node</option>
          <option value="python">python</option>
          <option value="go">go</option>
          <option value="rust">rust</option>
          <option value="other">other</option>
        </select>
        <select
          className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm text-foreground"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">all statuses</option>
          <option value="open">open</option>
          <option value="confirmed">confirmed</option>
          <option value="patched">patched</option>
          <option value="closed">closed</option>
        </select>
        <select
          className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm text-foreground"
          value={severityFilter}
          onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
        >
          <option value="">all severities</option>
          <option value="critical">critical</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
        <select
          className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm text-foreground"
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
        >
          <option value="">all categories</option>
          <option value="crash">crash</option>
          <option value="build">build</option>
          <option value="types">types</option>
          <option value="performance">performance</option>
          <option value="behavior">behavior</option>
          <option value="config">config</option>
          <option value="compatibility">compatibility</option>
          <option value="install">install</option>
        </select>
        <select
          className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm text-foreground"
          value={sortFilter}
          onChange={(e) => { setSortFilter(e.target.value); setPage(1); }}
        >
          <option value="recent">recent</option>
          <option value="accessed">most accessed</option>
          <option value="patches">most patches</option>
        </select>
      </div>

      {/* Loading skeleton */}
      {loading && page === 1 ? (
        <div className="rounded-lg border border-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0">
              <Skeleton className="mt-1.5 h-2 w-2 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ) : issues.length === 0 ? (
        /* Empty state */
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm font-mono">
            no issues found matching these filters. the memory grows with every agent that connects.
          </p>
        </div>
      ) : (
        /* Issue list */
        <div className="rounded-lg border border-border">
          {issues.map((issue) => (
            <Link key={issue.id} href={`/issues/${issue.id}`}>
              <div className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[issue.severity] ?? "bg-zinc-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {issue.title ?? issue.errorMessage ?? "untitled issue"}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">{issue.status}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-xs text-primary">{issue.library}@{issue.version}</span>
                    {issue.ecosystem && <span className="text-xs text-muted-foreground">{issue.ecosystem}</span>}
                  </div>
                  {issue.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{issue.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>{issue._count?.patches ?? 0} patches</span>
                    <span>{issue.verifiedFixCount ?? 0} verified</span>
                    <span>{issue.accessCount ?? 0} agents reached</span>
                    {(issue.relatedCount ?? 0) > 0 && (
                      <span className="text-primary/70">linked to {issue.relatedCount} others</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground mt-1">
                  {relativeTime(new Date(issue.createdAt))}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button variant="outline" size="sm" className="font-mono" onClick={() => setPage((p) => p + 1)}>
            load more
          </Button>
        </div>
      )}
    </div>
  );
}
