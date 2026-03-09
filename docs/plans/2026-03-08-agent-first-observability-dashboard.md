# Agent-First Observability Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the dashboard from a human CRUD interface into a pure observability layer where humans monitor agent activity but never write to the knowledge graph.

**Architecture:** Delete all write-facing UI (bug report form, voting, review forms, credit-based search). Add a new `/feed` API endpoint that returns chronological agent activity. Rebuild the dashboard around aggregate metrics + activity feed. Make detail pages read-only.

**Tech Stack:** Next.js 16 App Router, Hono API, Prisma, TypeScript, Tailwind v4, shadcn/ui

---

### Task 1: Add `/feed` API endpoint

The activity feed needs a backend endpoint. Currently no feed/activity endpoint exists. We'll add one that unions bugs, patches, and verifications into a single chronological stream.

**Files:**
- Create: `apps/api/src/routes/feed.ts`
- Modify: `apps/api/src/index.ts` (mount the new route)

**Step 1: Create the feed route**

```typescript
// apps/api/src/routes/feed.ts
import { Hono } from "hono";
import { prisma } from "@knownissue/db";
import type { AppEnv } from "../types.js";

const feed = new Hono<AppEnv>();

// GET /feed — public chronological activity feed
// Query params: type (bug|patch|verification), severity, ecosystem, range (today|week|month|all), page, limit
feed.get("/feed", async (c) => {
  const type = c.req.query("type"); // comma-separated: bug,patch,verification
  const severity = c.req.query("severity"); // comma-separated
  const ecosystem = c.req.query("ecosystem"); // comma-separated
  const range = c.req.query("range") ?? "all"; // today|week|month|all
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 20)));
  const offset = (page - 1) * limit;

  // Build date filter
  let dateFilter = "";
  const now = new Date();
  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    dateFilter = `AND created_at >= '${start.toISOString()}'`;
  } else if (range === "week") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    dateFilter = `AND created_at >= '${start.toISOString()}'`;
  } else if (range === "month") {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    dateFilter = `AND created_at >= '${start.toISOString()}'`;
  }

  // Determine which types to include
  const types = type ? type.split(",") : ["bug", "patch", "verification"];
  const severities = severity ? severity.split(",") : null;
  const ecosystems = ecosystem ? ecosystem.split(",") : null;

  const unions: string[] = [];

  if (types.includes("bug")) {
    const sevFilter = severities ? `AND b.severity IN (${severities.map(s => `'${s}'`).join(",")})` : "";
    const ecoFilter = ecosystems ? `AND b.ecosystem IN (${ecosystems.map(e => `'${e}'`).join(",")})` : "";
    unions.push(`
      SELECT b.id, 'bug' as type, b.title as summary, b.library, b.version,
             b.severity, b.ecosystem, b.status, b."createdAt" as created_at,
             u."githubUsername" as actor, u."avatarUrl" as actor_avatar,
             NULL as "bugId", NULL as "bugTitle"
      FROM "Bug" b
      LEFT JOIN "User" u ON b."reporterId" = u.id
      WHERE 1=1 ${dateFilter} ${sevFilter} ${ecoFilter}
    `);
  }

  if (types.includes("patch")) {
    const sevFilter = severities ? `AND bug.severity IN (${severities.map(s => `'${s}'`).join(",")})` : "";
    const ecoFilter = ecosystems ? `AND bug.ecosystem IN (${ecosystems.map(e => `'${e}'`).join(",")})` : "";
    unions.push(`
      SELECT p.id, 'patch' as type, p.explanation as summary, bug.library, bug.version,
             bug.severity, bug.ecosystem, bug.status, p."createdAt" as created_at,
             u."githubUsername" as actor, u."avatarUrl" as actor_avatar,
             bug.id as "bugId", bug.title as "bugTitle"
      FROM "Patch" p
      JOIN "Bug" bug ON p."bugId" = bug.id
      LEFT JOIN "User" u ON p."submitterId" = u.id
      WHERE 1=1 ${dateFilter} ${sevFilter} ${ecoFilter}
    `);
  }

  if (types.includes("verification")) {
    const sevFilter = severities ? `AND bug.severity IN (${severities.map(s => `'${s}'`).join(",")})` : "";
    const ecoFilter = ecosystems ? `AND bug.ecosystem IN (${ecosystems.map(e => `'${e}'`).join(",")})` : "";
    unions.push(`
      SELECT v.id, 'verification' as type, v.outcome as summary, bug.library, bug.version,
             bug.severity, bug.ecosystem, bug.status, v."createdAt" as created_at,
             u."githubUsername" as actor, u."avatarUrl" as actor_avatar,
             bug.id as "bugId", bug.title as "bugTitle"
      FROM "Verification" v
      JOIN "Patch" p ON v."patchId" = p.id
      JOIN "Bug" bug ON p."bugId" = bug.id
      LEFT JOIN "User" u ON v."verifierId" = u.id
      WHERE 1=1 ${dateFilter} ${sevFilter} ${ecoFilter}
    `);
  }

  if (unions.length === 0) {
    return c.json({ items: [], total: 0, page, limit });
  }

  const query = unions.join(" UNION ALL ");

  const [items, countResult] = await Promise.all([
    prisma.$queryRawUnsafe(`${query} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`),
    prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM (${query}) as feed`),
  ]);

  const total = Number((countResult as Array<{ count: bigint }>)[0]?.count ?? 0);

  return c.json({ items, total, page, limit });
});

export { feed };
```

**Step 2: Mount the route in `apps/api/src/index.ts`**

Add after existing route imports:
```typescript
import { feed } from "./routes/feed.js";
```

Add after existing `app.route("/", ...)` calls:
```typescript
app.route("/", feed);
```

**Step 3: Verify the endpoint works**

Run: `curl http://localhost:3001/feed?limit=5`
Expected: JSON response with `items` array, `total`, `page`, `limit`

**Step 4: Commit**

```bash
git add apps/api/src/routes/feed.ts apps/api/src/index.ts
git commit -m "feat: add /feed API endpoint for activity stream"
```

---

### Task 2: Add `/stats` enhanced endpoint

The existing `GET /stats` returns `{ bugs, patches, users }`. We need additional metrics: open criticals count and patch approval rate.

**Files:**
- Modify: `apps/api/src/routes/auth.ts:16-23`

**Step 1: Enhance the stats endpoint**

Replace the existing stats handler in `apps/api/src/routes/auth.ts` (lines 16-23):

```typescript
auth.get("/stats", async (c) => {
  const [bugs, patches, users, openCriticals, patchScores] = await Promise.all([
    prisma.bug.count(),
    prisma.patch.count(),
    prisma.user.count(),
    prisma.bug.count({
      where: { severity: "critical", status: "open" },
    }),
    prisma.patch.aggregate({
      _avg: { score: true },
      _count: { _all: true },
    }),
  ]);

  // Approval rate: patches with score > 0 / total patches
  const approvedPatches = await prisma.patch.count({
    where: { score: { gt: 0 } },
  });
  const approvalRate = patches > 0 ? Math.round((approvedPatches / patches) * 100) : 0;

  return c.json({ bugs, patches, users, openCriticals, approvalRate });
});
```

**Step 2: Verify**

Run: `curl http://localhost:3001/stats`
Expected: JSON with `bugs`, `patches`, `users`, `openCriticals`, `approvalRate` fields

**Step 3: Commit**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat: enhance /stats with openCriticals and approvalRate"
```

---

### Task 3: Add `fetchFeed` and `fetchAggregateStats` server actions

**Files:**
- Create: `apps/web/src/app/actions/feed.ts`
- Modify: `apps/web/src/app/actions/bugs.ts` (remove `createBug`)

**Step 1: Create the feed server action**

```typescript
// apps/web/src/app/actions/feed.ts
"use server";

import { apiFetch } from "@/lib/api";

export async function fetchFeed(params: {
  type?: string;
  severity?: string;
  ecosystem?: string;
  range?: string;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const res = await apiFetch(`/feed?${searchParams.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch feed" }));
    throw new Error(err.error || "Failed to fetch feed");
  }
  return res.json();
}

export async function fetchAggregateStats() {
  // Public endpoint, no auth needed — but apiFetch attaches token anyway, which is fine
  const res = await apiFetch("/stats");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch stats" }));
    throw new Error(err.error || "Failed to fetch stats");
  }
  return res.json() as Promise<{
    bugs: number;
    patches: number;
    users: number;
    openCriticals: number;
    approvalRate: number;
  }>;
}
```

**Step 2: Remove `createBug` from `apps/web/src/app/actions/bugs.ts`**

Delete the `createBug` function (lines 40-50). Keep `fetchBugs` and `fetchBugById`.

**Step 3: Commit**

```bash
git add apps/web/src/app/actions/feed.ts apps/web/src/app/actions/bugs.ts
git commit -m "feat: add feed/stats server actions, remove createBug"
```

---

### Task 4: Delete write-only server actions and pages

**Files:**
- Delete: `apps/web/src/app/actions/patches.ts` — remove `submitPatch` (keep `fetchPatchById` by moving it or keeping the file with only the read function)
- Delete: `apps/web/src/app/actions/reviews.ts` (entire file — all write actions)
- Delete: `apps/web/src/app/(dashboard)/bugs/new/` (entire directory)
- Delete: `apps/web/src/app/(dashboard)/bugs/page.tsx` (bug list page)

**Step 1: Clean up patches.ts**

Keep only `fetchPatchById` in `apps/web/src/app/actions/patches.ts`. Delete `submitPatch`.

**Step 2: Delete reviews.ts**

```bash
rm apps/web/src/app/actions/reviews.ts
```

**Step 3: Delete bug report page**

```bash
rm -rf apps/web/src/app/\(dashboard\)/bugs/new/
```

**Step 4: Delete bug list page**

```bash
rm apps/web/src/app/\(dashboard\)/bugs/page.tsx
```

**Step 5: Delete filter-bar component** (no longer needed — replaced by activity filters)

```bash
rm apps/web/src/components/filter-bar.tsx
```

**Step 6: Verify no broken imports**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Errors for references to deleted code (we'll fix those in subsequent tasks)

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove write-facing UI (bug report, submit patch, reviews)"
```

---

### Task 5: Create the activity feed component

Reusable component shared between `/dashboard` (shows 10 items) and `/activity` (paginated).

**Files:**
- Create: `apps/web/src/components/activity-feed.tsx`

**Step 1: Create the component**

```typescript
// apps/web/src/components/activity-feed.tsx
"use client";

import Link from "next/link";
import { ListItem } from "@/components/list-item";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { relativeTime, initials } from "@/lib/helpers";
import type { Severity } from "@knownissue/shared";

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-zinc-400",
};

export type FeedItem = {
  id: string;
  type: "bug" | "patch" | "verification";
  summary: string | null;
  library: string;
  version: string;
  severity: Severity;
  ecosystem: string;
  status: string;
  created_at: string;
  actor: string | null;
  actor_avatar: string | null;
  bugId: string | null;
  bugTitle: string | null;
};

function actionLabel(item: FeedItem): string {
  switch (item.type) {
    case "bug":
      return "reported bug in";
    case "patch":
      return "submitted patch for";
    case "verification":
      return `verified patch (${item.summary}) for`;
    default:
      return "acted on";
  }
}

function itemHref(item: FeedItem): string {
  switch (item.type) {
    case "bug":
      return `/bugs/${item.id}`;
    case "patch":
      return `/patches/${item.id}`;
    case "verification":
      return item.bugId ? `/bugs/${item.bugId}` : "#";
    default:
      return "#";
  }
}

export function ActivityFeed({ items }: { items: FeedItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm font-mono">no activity yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      {items.map((item) => (
        <Link key={`${item.type}-${item.id}`} href={itemHref(item)}>
          <ListItem className="gap-3 cursor-pointer">
            <span className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[item.severity] ?? "bg-zinc-400"}`} />
            <Avatar className="h-5 w-5 shrink-0">
              <AvatarImage src={item.actor_avatar ?? undefined} />
              <AvatarFallback className="text-[9px]">
                {initials(item.actor ?? "??")}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-sm">
              <span className="font-mono text-muted-foreground">{item.actor ?? "agent"}</span>
              {" "}
              <span className="text-muted-foreground">{actionLabel(item)}</span>
              {" "}
              <span className="font-medium">{item.library}@{item.version}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {relativeTime(new Date(item.created_at))}
            </span>
          </ListItem>
        </Link>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/activity-feed.tsx
git commit -m "feat: add reusable ActivityFeed component"
```

---

### Task 6: Rebuild the overview page (`/dashboard`)

Replace current dashboard with aggregate metrics + recent activity feed.

**Files:**
- Rewrite: `apps/web/src/app/(dashboard)/dashboard/page.tsx`

**Step 1: Rewrite the dashboard page**

Replace the entire contents of `apps/web/src/app/(dashboard)/dashboard/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ActivityFeed, type FeedItem } from "@/components/activity-feed";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchFeed, fetchAggregateStats } from "@/app/actions/feed";

export default function DashboardPage() {
  const [stats, setStats] = useState<{
    bugs: number;
    patches: number;
    openCriticals: number;
    approvalRate: number;
  } | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
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
          setFeed(feedData.items ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStats(null);
          setFeed([]);
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
        <div className="rounded-lg border border-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
              <Skeleton className="h-2 w-2 rounded-full" />
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
      <PageHeader title="overview" />

      {/* Aggregate metrics */}
      {stats && (
        <div className="flex items-baseline gap-8">
          <div>
            <span className="text-2xl font-bold font-mono">{stats.bugs}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">bugs tracked</span>
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
        <ActivityFeed items={feed} />
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors related to dashboard page

**Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: rebuild overview page with aggregate metrics + activity feed"
```

---

### Task 7: Create the activity page (`/activity`)

**Files:**
- Create: `apps/web/src/app/(dashboard)/activity/page.tsx`

**Step 1: Create the activity page**

```typescript
// apps/web/src/app/(dashboard)/activity/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { ActivityFeed, type FeedItem } from "@/components/activity-feed";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fetchFeed } from "@/app/actions/feed";

type ActionType = "bug" | "patch" | "verification";
type TimeRange = "today" | "week" | "month" | "all";

const ACTION_TYPES: { value: ActionType; label: string }[] = [
  { value: "bug", label: "bugs" },
  { value: "patch", label: "patches" },
  { value: "verification", label: "verifications" },
];

const SEVERITIES = ["critical", "high", "medium", "low"] as const;
const ECOSYSTEMS = ["node", "python", "go", "rust", "other"] as const;
const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "today", label: "today" },
  { value: "week", label: "this week" },
  { value: "month", label: "this month" },
  { value: "all", label: "all time" },
];

export default function ActivityPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeTypes, setActiveTypes] = useState<Set<ActionType>>(new Set());
  const [activeSeverities, setActiveSeverities] = useState<Set<string>>(new Set());
  const [activeEcosystems, setActiveEcosystems] = useState<Set<string>>(new Set());
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: pageSize };
      if (activeTypes.size > 0) params.type = [...activeTypes].join(",");
      if (activeSeverities.size > 0) params.severity = [...activeSeverities].join(",");
      if (activeEcosystems.size > 0) params.ecosystem = [...activeEcosystems].join(",");
      if (timeRange !== "all") params.range = timeRange;

      const data = await fetchFeed(params);
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, activeTypes, activeSeverities, activeEcosystems, timeRange]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [activeTypes, activeSeverities, activeEcosystems, timeRange]);

  return (
    <div className="space-y-4">
      <PageHeader title="activity" />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Action type chips */}
        {ACTION_TYPES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setActiveTypes(toggleSet(activeTypes, value))}
            className={cn(
              "rounded-md border px-2.5 py-1 font-mono text-xs transition-colors",
              activeTypes.has(value)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-surface-hover"
            )}
          >
            {label}
          </button>
        ))}

        <span className="text-border">|</span>

        {/* Severity chips */}
        {SEVERITIES.map((s) => (
          <button
            key={s}
            onClick={() => setActiveSeverities(toggleSet(activeSeverities, s))}
            className={cn(
              "rounded-md border px-2.5 py-1 font-mono text-xs transition-colors",
              activeSeverities.has(s)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-surface-hover"
            )}
          >
            {s}
          </button>
        ))}

        <span className="text-border">|</span>

        {/* Ecosystem chips */}
        {ECOSYSTEMS.map((e) => (
          <button
            key={e}
            onClick={() => setActiveEcosystems(toggleSet(activeEcosystems, e))}
            className={cn(
              "rounded-md border px-2.5 py-1 font-mono text-xs transition-colors",
              activeEcosystems.has(e)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-surface-hover"
            )}
          >
            {e}
          </button>
        ))}

        <span className="text-border">|</span>

        {/* Time range */}
        {TIME_RANGES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setTimeRange(value)}
            className={cn(
              "rounded-md border px-2.5 py-1 font-mono text-xs transition-colors",
              timeRange === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-surface-hover"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="rounded-lg border border-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ) : (
        <ActivityFeed items={items} />
      )}

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
```

**Step 2: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/activity/
git commit -m "feat: add /activity page with filtered activity feed"
```

---

### Task 8: Make bug detail page read-only

Strip the "submit patch" button, patch dialog, and all interactive forms from `bug-detail-client.tsx`.

**Files:**
- Modify: `apps/web/src/app/(dashboard)/bugs/[id]/bug-detail-client.tsx`

**Step 1: Remove all write UI from BugDetailClient**

Key changes:
- Remove `patchDialogOpen`, `patchExplanation`, `patchCode`, `isSubmittingPatch` state
- Remove `handleSubmitPatch` function
- Remove the "submit patch" `<Button>` (line 509)
- Remove the `<Dialog>` for submitting patches (lines 515-550)
- Remove imports: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `Textarea`, `Button`, `toast`
- Update breadcrumb to link to `/activity` instead of `/bugs`
- Update keyboard handler: `u` key navigates to `/activity` instead of `/bugs`

**Step 2: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/bugs/\[id\]/bug-detail-client.tsx
git commit -m "feat: make bug detail page read-only"
```

---

### Task 9: Update sidebar navigation

Remove "bugs" and "report bug" nav items. Add "activity". Remove credits display.

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx`

**Step 1: Update nav items**

Replace `navItems` array (lines 20-25):

```typescript
const navItems = [
  { href: "/dashboard", label: "overview", icon: LayoutDashboard, shortcut: "G D" },
  { href: "/activity", label: "activity", icon: Activity, shortcut: "G A" },
  { href: "/profile", label: "profile", icon: User, shortcut: "G P" },
];
```

Add `Activity` to lucide imports. Remove `Bug`, `PlusCircle`.

**Step 2: Remove credits from sidebar bottom**

Replace the bottom section (lines 118-129). Remove the credits display, keep only `UserButton`:

```typescript
<div className="border-t border-border p-3">
  <UserButton />
</div>
```

Remove `fetchUserStats` import and the `useEffect` that fetches credits (lines 36-40), and the `credits` state (line 34).

**Step 3: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/src/components/sidebar.tsx
git commit -m "feat: update sidebar to overview/activity/profile"
```

---

### Task 10: Update command palette

Remove bug search, remove "report bug" action. Keep navigation-only.

**Files:**
- Modify: `apps/web/src/components/command-palette.tsx`

**Step 1: Strip bug search and write actions**

- Remove `fetchBugs` import
- Remove `recentBugs`, `searchResults`, `query` state
- Remove the debounce search `useEffect`
- Remove the `bugsToShow` / `bugsHeading` logic
- Remove the "recent bugs" / "search results" `CommandGroup`
- Remove the "report a new bug" action
- Update navigation items to match new routes:
  - dashboard → overview
  - Remove "bugs" item
  - Remove "report bug" item
  - Add "activity" item
- Update search placeholder to "navigate..."

**Step 2: Commit**

```bash
git add apps/web/src/components/command-palette.tsx
git commit -m "feat: simplify command palette to navigation-only"
```

---

### Task 11: Rebuild profile page

Remove "my bugs" / "my patches" tabs. Elevate MCP endpoint. Add agent activity summary stats.

**Files:**
- Modify: `apps/web/src/app/(dashboard)/profile/page.tsx`

**Step 1: Rewrite profile page**

Key changes:
- Remove `fetchUserBugs`, `fetchUserPatches` imports and calls
- Remove `bugs`, `patches` state
- Remove the `<Tabs>` section entirely
- Remove credits from stats row
- Keep: user header, MCP endpoint section
- Add: setup instructions text below MCP endpoint
- Move MCP section above stats to make it the primary focus
- Update stats to show read-only summary (bugsReported, patchesSubmitted, verificationsGiven — no credits)

**Step 2: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/profile/page.tsx
git commit -m "feat: rebuild profile page with MCP setup focus"
```

---

### Task 12: Update patch detail page breadcrumb

**Files:**
- Modify: `apps/web/src/app/(dashboard)/patches/[id]/page.tsx`

**Step 1: Update breadcrumb**

Change the breadcrumb link from `/bugs` to `/activity`:

```typescript
<Link href="/activity" className="hover:text-foreground transition-colors">activity</Link>
```

The patch detail page is already read-only (no vote buttons exist). Just fix the breadcrumb.

**Step 2: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/patches/\[id\]/page.tsx
git commit -m "fix: update patch detail breadcrumb to /activity"
```

---

### Task 13: Update keyboard navigation shortcuts

**Files:**
- Modify: `apps/web/src/hooks/use-keyboard-navigation.ts`

**Step 1: Update G-shortcuts**

Check for any hardcoded `G B` (go to bugs) or `C` (create bug) shortcuts and remove or replace them:
- Remove `G B` → `/bugs`
- Remove `C` → `/bugs/new`
- Add `G A` → `/activity`
- Keep `G D` → `/dashboard`
- Keep `G P` → `/profile`

**Step 2: Commit**

```bash
git add apps/web/src/hooks/use-keyboard-navigation.ts
git commit -m "feat: update keyboard shortcuts for new nav structure"
```

---

### Task 14: Type-check and verify everything compiles

**Files:** None (verification only)

**Step 1: Full type-check**

Run: `cd /Users/gong/Programming/Projects/knownissue && pnpm lint`
Expected: PASS with no errors

**Step 2: Fix any remaining import/reference errors**

Check for any lingering imports of deleted files (`createBug`, `submitPatch`, `reviewPatch`, `FilterBar`, etc.) and remove them.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve remaining import/reference errors"
```

---

### Task 15: Visual smoke test

**Files:** None (manual verification)

**Step 1: Start the dev server**

Run: `pnpm dev`

**Step 2: Verify each page**

- `http://localhost:3000/dashboard` — aggregate metrics + recent activity feed
- `http://localhost:3000/activity` — full feed with filters, pagination
- `http://localhost:3000/profile` — MCP endpoint prominent, no tabs
- Click an activity row → read-only bug/patch detail
- Verify sidebar shows overview/activity/profile only
- Verify Cmd+K palette has no bug search, no "report bug"
- Verify `/bugs/new` returns 404
- Verify `/bugs` returns 404

**Step 3: Commit any visual fixes**

```bash
git add -A
git commit -m "fix: visual polish from smoke test"
```

---

### Task 16: Update landing page copy

**Files:**
- Modify: `apps/web/src/app/page.tsx`

**Step 1: Update messaging**

Review the landing page and update copy to describe knownissue as:
- Agent-first knowledge graph for library bugs
- Connect AI coding agents via MCP
- Monitor what agents find and fix across your ecosystem

Keep the page structure. Update text content only. If there's a terminal demo, update it to show MCP tool calls.

**Step 2: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat: update landing page copy for agent-first positioning"
```
