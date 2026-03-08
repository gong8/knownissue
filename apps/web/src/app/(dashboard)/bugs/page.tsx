"use client";

import { useState, useMemo } from "react";
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
import type { Severity, BugStatus } from "@knownissue/shared";

// ── Severity badge colors ───────────────────────────────────────────────────

const severityColor: Record<Severity, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/20",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  low: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

const statusColor: Record<BugStatus, string> = {
  open: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  confirmed: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  patched: "bg-green-500/15 text-green-400 border-green-500/20",
  closed: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

const ecosystems = ["all", "node", "python", "go", "rust", "other"] as const;
const statuses: ("all" | BugStatus)[] = [
  "all",
  "open",
  "confirmed",
  "patched",
  "closed",
];
const severities: Severity[] = ["critical", "high", "medium", "low"];

// ── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ── Page Component ──────────────────────────────────────────────────────────

export default function BugsPage() {
  const [search, setSearch] = useState("");
  const [ecosystem, setEcosystem] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [activeSeverities, setActiveSeverities] = useState<Set<Severity>>(
    new Set()
  );

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
      if (status !== "all" && bug.status !== status) return false;
      if (
        activeSeverities.size > 0 &&
        !activeSeverities.has(bug.severity)
      ) {
        return false;
      }
      return true;
    });
  }, [search, ecosystem, status, activeSeverities]);

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
        {filteredBugs.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="mb-3 h-8 w-8" />
              <p className="text-sm">No bugs match your filters.</p>
            </CardContent>
          </Card>
        )}

        {filteredBugs.map((bug) => (
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

      {/* Pagination placeholder */}
      <div className="flex items-center justify-center gap-2 pt-2">
        <Button variant="outline" size="sm" disabled>
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">Page 1 of 1</span>
        <Button variant="outline" size="sm" disabled>
          Next
        </Button>
      </div>
    </div>
  );
}
