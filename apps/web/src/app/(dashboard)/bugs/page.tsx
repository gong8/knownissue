"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Search, FileCode } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mockBugs } from "@/lib/mock-data";
import { severityColor, statusColor, relativeTime } from "@/lib/helpers";
import type { Severity, BugStatus } from "@knownissue/shared";

const ecosystems = ["all", "node", "python", "go", "rust", "other"] as const;
const libraries = ["all", ...new Set(mockBugs.map((b) => b.library))];
const statuses: ("all" | BugStatus)[] = [
  "all",
  "open",
  "confirmed",
  "patched",
  "closed",
];
const severities: Severity[] = ["critical", "high", "medium", "low"];

// ── Page Component ──────────────────────────────────────────────────────────

export default function BugsPage() {
  const [search, setSearch] = useState("");
  const [ecosystem, setEcosystem] = useState<string>("all");
  const [library, setLibrary] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [activeSeverities, setActiveSeverities] = useState<Set<Severity>>(
    new Set()
  );
  const [page, setPage] = useState(1);
  const pageSize = 10;

  function toggleSeverity(s: Severity) {
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const filteredBugs = useMemo(() => {
    return mockBugs.filter((bug) => {
      if (search && !bug.title.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (ecosystem !== "all" && bug.ecosystem !== ecosystem) return false;
      if (library !== "all" && bug.library !== library) return false;
      if (status !== "all" && bug.status !== status) return false;
      if (
        activeSeverities.size > 0 &&
        !activeSeverities.has(bug.severity)
      ) {
        return false;
      }
      return true;
    });
  }, [search, ecosystem, library, status, activeSeverities]);

  const totalPages = Math.max(1, Math.ceil(filteredBugs.length / pageSize));
  const paginatedBugs = filteredBugs.slice((page - 1) * pageSize, page * pageSize);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, ecosystem, library, status, activeSeverities]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bugs</h1>
          <p className="mt-1 text-muted-foreground">
            Browse and search known issues across libraries
          </p>
        </div>
        <Button asChild>
          <Link href="/bugs/new">Report Bug</Link>
        </Button>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search bugs by title..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Ecosystem filter */}
        <Select value={ecosystem} onValueChange={setEcosystem}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Ecosystem" />
          </SelectTrigger>
          <SelectContent>
            {ecosystems.map((eco) => (
              <SelectItem key={eco} value={eco}>
                {eco === "all" ? "All ecosystems" : eco}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Library filter */}
        <Select value={library} onValueChange={setLibrary}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Library" />
          </SelectTrigger>
          <SelectContent>
            {libraries.map((lib) => (
              <SelectItem key={lib} value={lib}>
                {lib === "all" ? "All libraries" : lib}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Severity toggle badges */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Severity:</span>
          {severities.map((s) => (
            <button
              key={s}
              onClick={() => toggleSeverity(s)}
              className="focus:outline-none"
            >
              <Badge
                className={`cursor-pointer transition-opacity ${
                  activeSeverities.size === 0 || activeSeverities.has(s)
                    ? severityColor[s]
                    : "opacity-30 " + severityColor[s]
                }`}
              >
                {s}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      {/* Bug list */}
      <div className="space-y-3">
        {paginatedBugs.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="mb-3 h-8 w-8" />
              <p className="text-sm">No bugs match your filters.</p>
            </CardContent>
          </Card>
        )}

        {paginatedBugs.map((bug) => (
          <Link key={bug.id} href={`/bugs/${bug.id}`}>
            <Card className="transition-colors hover:border-primary/30 hover:bg-card/80">
              <CardContent className="flex items-start justify-between gap-4 p-5">
                <div className="min-w-0 flex-1 space-y-2">
                  {/* Title */}
                  <p className="text-sm font-medium leading-snug">
                    {bug.title}
                  </p>

                  {/* Badges row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {bug.library}@{bug.version}
                    </Badge>
                    <Badge className={`text-xs ${severityColor[bug.severity]}`}>
                      {bug.severity}
                    </Badge>
                    <Badge className={`text-xs ${statusColor[bug.status]}`}>
                      {bug.status}
                    </Badge>
                    {bug.patches && bug.patches.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <FileCode className="h-3 w-3" />
                        {bug.patches.length}{" "}
                        {bug.patches.length === 1 ? "patch" : "patches"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {relativeTime(bug.createdAt)}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-2 pt-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
