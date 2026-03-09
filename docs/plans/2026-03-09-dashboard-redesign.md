# Dashboard Redesign Implementation Plan (Revised)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the authenticated dashboard so every page reinforces the mission: "the network is alive, and your agent's participation matters."

**Architecture:** Backend-first — expand API endpoints with mission-aligned metrics, then rebuild frontend pages. Existing route structure is replaced: `/dashboard`→`/overview`, `/activity`→removed (absorbed into overview), `/profile`→`/your-agent`. New `/explore` page added. Detail pages get incremental enhancements.

**Tech Stack:** Hono API routes, Prisma queries, Next.js 16 App Router, Tailwind v4, existing shadcn components.

**Note:** No test framework exists. Each task includes manual verification via `pnpm dev` and `pnpm lint`.

## Current State (as of 2026-03-09)

**Already completed:**
- Backend renamed from `bugs` to `issues` throughout (routes at `/issues`, services, Prisma model `Issue`)
- `issues/[id]` page exists with `issue-detail-client.tsx` (old `bugs/[id]` removed)
- Feed API returns `issueId`/`issueTitle`
- Stats API returns `issues` (not `bugs`)
- Server actions: `fetchIssueById`, `fetchPatchById`, `fetchFeed`, `fetchAggregateStats`, `fetchCurrentUser`, `fetchUserStats`
- Activity feed component uses "issue" terminology
- `activity.ts` service exists with `getMyActivity()` (but no route exposes it)
- Dashboard page header says "overview" but route is still `/dashboard`

**Key files and their current state:**

| File | Current state |
|---|---|
| `apps/api/src/routes/auth.ts` | `/stats` returns `{issues, patches, users, openCriticals, approvalRate}` — missing mission metrics |
| `apps/api/src/routes/users.ts` | `/users/me/stats` returns `{credits, issuesReported, patchesSubmitted, verificationsGiven}` — no outcome breakdowns, no `/users/me/activity` route |
| `apps/api/src/routes/issues.ts` | `GET /issues` list mode has no category/sort params |
| `apps/api/src/services/issue.ts` | `listIssues()` returns basic fields + `_count.patches` — no verification counts, no relation counts |
| `apps/api/src/services/activity.ts` | `getMyActivity()` exists but is not exposed as an API route |
| `apps/web/src/components/sidebar.tsx` | Nav items: `[{href:"/dashboard", label:"overview"}, {href:"/activity", label:"activity"}, {href:"/profile", label:"profile"}]` |
| `apps/web/src/hooks/use-keyboard-navigation.ts` | G D→`/dashboard`, G A→`/activity`, G P→`/profile` |
| `apps/web/src/components/command-palette.tsx` | Navigates to `/dashboard`, `/activity`, `/profile` |
| `apps/web/src/components/keyboard-help-dialog.tsx` | Shows G D "go to dashboard", G A "go to activity", G P "go to profile" |
| `apps/web/src/app/actions/feed.ts` | `fetchAggregateStats` return type missing `fixesReused`, `issuesResolved`, `verifiedThisWeek` |
| `apps/web/src/app/actions/user.ts` | `fetchUserStats` return type missing outcome breakdowns |
| `apps/web/src/app/(dashboard)/dashboard/page.tsx` | Shows old metrics (issues tracked, patches, approval rate, open criticals) + 10-item feed |
| `apps/web/src/app/(dashboard)/activity/page.tsx` | Full filtered feed with pagination — to be absorbed into overview |
| `apps/web/src/app/(dashboard)/profile/page.tsx` | MCP connection + basic stats — to become your-agent |
| Issue detail (`issue-detail-client.tsx`) | Does NOT surface `searchHitCount`, `relatedIssues`, or `errorBefore`/`errorAfter` |
| Patch detail (`patches/[id]/page.tsx`) | Does NOT surface `errorBefore`/`errorAfter` or shared_fix relations |
| `apps/web/next.config.ts` | No redirects configured |

---

### Task 1: Expand `/stats` endpoint with mission-aligned metrics

**Files:**
- Modify: `apps/api/src/routes/auth.ts:16-35`

**Step 1: Replace the stats handler**

In `apps/api/src/routes/auth.ts`, replace the `GET /stats` handler (lines 16-35) with:

```typescript
auth.get("/stats", async (c) => {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    issues,
    patches,
    users,
    openCriticals,
    patchesWithPositiveScore,
    issuesResolved,
    verifiedThisWeek,
    fixesReusedResult,
  ] = await Promise.all([
    prisma.issue.count(),
    prisma.patch.count(),
    prisma.user.count(),
    prisma.issue.count({
      where: { severity: "critical", status: "open" },
    }),
    prisma.patch.count({
      where: { score: { gt: 0 } },
    }),
    prisma.issue.count({
      where: { status: { in: ["patched", "closed"] } },
    }),
    prisma.verification.count({
      where: { createdAt: { gte: oneWeekAgo } },
    }),
    prisma.$queryRawUnsafe<[{ total: bigint }]>(
      `SELECT COALESCE(SUM("accessCount"), 0) AS total FROM "Issue"`
    ),
  ]);

  const approvalRate = patches > 0
    ? Math.round((patchesWithPositiveScore / patches) * 100)
    : 0;

  return c.json({
    issues,
    patches,
    users,
    openCriticals,
    approvalRate,
    fixesReused: Number(fixesReusedResult[0]?.total ?? 0),
    issuesResolved,
    verifiedThisWeek,
  });
});
```

**Step 2: Verify**

Run: `pnpm lint`
Run: `pnpm dev`, then `curl http://localhost:3001/stats`
Expected: JSON includes `fixesReused`, `issuesResolved`, `verifiedThisWeek`

**Step 3: Commit**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat(api): expand /stats with mission-aligned metrics"
```

---

### Task 2: Add `/stats/ecosystem` endpoint

**Files:**
- Modify: `apps/api/src/routes/auth.ts` (add after `/stats` route)

**Step 1: Add ecosystem breakdown endpoint**

Add after the `/stats` route, before `export { auth }`:

```typescript
auth.get("/stats/ecosystem", async (c) => {
  const ecosystems = await prisma.issue.groupBy({
    by: ["ecosystem"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  const results = await Promise.all(
    ecosystems.map(async (eco) => {
      const [patchCount, resolvedCount, topLibraries] = await Promise.all([
        prisma.patch.count({
          where: { issue: { ecosystem: eco.ecosystem } },
        }),
        prisma.issue.count({
          where: {
            ecosystem: eco.ecosystem,
            status: { in: ["patched", "closed"] },
          },
        }),
        prisma.issue.groupBy({
          by: ["library"],
          where: { ecosystem: eco.ecosystem },
          _count: { id: true },
          orderBy: { _count: { id: "desc" } },
          take: 5,
        }),
      ]);

      return {
        ecosystem: eco.ecosystem,
        issueCount: eco._count.id,
        patchCount,
        resolutionRate:
          eco._count.id > 0
            ? Math.round((resolvedCount / eco._count.id) * 100)
            : 0,
        topLibraries: topLibraries.map((lib) => ({
          library: lib.library,
          issueCount: lib._count.id,
        })),
      };
    })
  );

  return c.json(results);
});
```

**Step 2: Verify**

Run: `pnpm lint`
Run: `curl http://localhost:3001/stats/ecosystem`

**Step 3: Commit**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat(api): add /stats/ecosystem endpoint"
```

---

### Task 3: Expand `/users/me/stats` with outcome breakdowns

**Files:**
- Modify: `apps/api/src/routes/users.ts:21-31`

**Step 1: Replace the stats handler**

Replace `GET /users/me/stats` in `apps/api/src/routes/users.ts` (lines 21-31):

```typescript
users.get("/users/me/stats", async (c) => {
  const user = c.get("user");
  const [
    credits,
    issuesReported,
    issuesPatched,
    patchesSubmitted,
    patchesVerifiedFixed,
    verificationsGiven,
    verificationsFixed,
    verificationsNotFixed,
    verificationsPartial,
  ] = await Promise.all([
    getCredits(user.id),
    prisma.issue.count({ where: { reporterId: user.id } }),
    prisma.issue.count({
      where: { reporterId: user.id, status: { in: ["patched", "closed"] } },
    }),
    prisma.patch.count({ where: { submitterId: user.id } }),
    prisma.patch.count({
      where: {
        submitterId: user.id,
        verifications: { some: { outcome: "fixed" } },
      },
    }),
    prisma.verification.count({ where: { verifierId: user.id } }),
    prisma.verification.count({ where: { verifierId: user.id, outcome: "fixed" } }),
    prisma.verification.count({ where: { verifierId: user.id, outcome: "not_fixed" } }),
    prisma.verification.count({ where: { verifierId: user.id, outcome: "partial" } }),
  ]);
  return c.json({
    credits,
    issuesReported,
    issuesPatched,
    patchesSubmitted,
    patchesVerifiedFixed,
    verificationsGiven,
    verificationsFixed,
    verificationsNotFixed,
    verificationsPartial,
  });
});
```

**Step 2: Verify**

Run: `pnpm lint`

**Step 3: Commit**

```bash
git add apps/api/src/routes/users.ts
git commit -m "feat(api): expand /users/me/stats with outcome breakdowns"
```

---

### Task 4: Add `/users/me/activity` route

The `getMyActivity()` service already exists in `apps/api/src/services/activity.ts`. It just needs a route.

**Files:**
- Modify: `apps/api/src/routes/users.ts` (add new route)

**Step 1: Import activity service and add route**

Add import at top of `apps/api/src/routes/users.ts`:

```typescript
import { getMyActivity } from "../services/activity";
```

Add route before `export { users }`:

```typescript
users.get("/users/me/activity", async (c) => {
  const user = c.get("user");
  const type = c.req.query("type");
  const outcome = c.req.query("outcome");
  const rawLimit = parseInt(c.req.query("limit") || "20");
  const limit = Math.min(50, Math.max(1, rawLimit));
  const result = await getMyActivity(user.id, { type: type || undefined, outcome: outcome || undefined, limit });
  return c.json(result);
});
```

**Step 2: Verify**

Run: `pnpm lint`

**Step 3: Commit**

```bash
git add apps/api/src/routes/users.ts
git commit -m "feat(api): expose /users/me/activity route"
```

---

### Task 5: Expand `listIssues` with filters, sort, and enriched data

**Files:**
- Modify: `apps/api/src/services/issue.ts:431-468` (the `listIssues` function)
- Modify: `apps/api/src/routes/issues.ts:45-51` (pass new params)

**Step 1: Replace `listIssues` function**

In `apps/api/src/services/issue.ts`, replace the `listIssues` function (lines 431-468):

```typescript
export async function listIssues(params: {
  library?: string;
  version?: string;
  ecosystem?: string;
  status?: string[];
  severity?: string[];
  category?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}) {
  const { library, version, ecosystem, status, severity, category, sort = "recent", limit = 20, offset = 0 } = params;

  const where: Record<string, unknown> = {};
  if (library) where.library = { contains: library, mode: "insensitive" };
  if (version) where.version = version;
  if (ecosystem) where.ecosystem = ecosystem;
  if (category) where.category = category;
  if (status && status.length > 0) {
    where.status = status.length === 1 ? status[0] : { in: status };
  }
  if (severity && severity.length > 0) {
    where.severity = severity.length === 1 ? severity[0] : { in: severity };
  }

  const orderBy: Record<string, string> =
    sort === "accessed" ? { accessCount: "desc" } : { createdAt: "desc" };

  const [issues, total] = await Promise.all([
    prisma.issue.findMany({
      where,
      include: {
        reporter: true,
        _count: {
          select: {
            patches: true,
            relationsFrom: true,
            relationsTo: true,
          },
        },
        patches: {
          select: {
            verifications: {
              where: { outcome: "fixed" },
              select: { id: true },
            },
          },
        },
      },
      orderBy,
      take: limit,
      skip: offset,
    }),
    prisma.issue.count({ where }),
  ]);

  const enriched = issues.map((issue) => {
    const verifiedFixCount = issue.patches.reduce(
      (sum, p) => sum + p.verifications.length,
      0
    );
    return {
      ...issue,
      patches: undefined,
      verifiedFixCount,
      relatedCount: issue._count.relationsFrom + issue._count.relationsTo,
    };
  });

  if (sort === "patches") {
    enriched.sort((a, b) => (b._count?.patches ?? 0) - (a._count?.patches ?? 0));
  }

  return { issues: enriched, total };
}
```

**Step 2: Update issues route to pass new params**

In `apps/api/src/routes/issues.ts`, replace lines 45-51 (the list mode block):

```typescript
  const statusList = status ? status.split(",").map((s) => s.trim()) : undefined;
  const severityList = severity ? severity.split(",").map((s) => s.trim()) : undefined;
  const category = c.req.query("category");
  const sort = c.req.query("sort");

  const result = await issueService.listIssues({
    library, version, ecosystem,
    status: statusList, severity: severityList,
    category: category || undefined,
    sort: sort || undefined,
    limit, offset,
  });
  return c.json(result);
```

**Step 3: Verify**

Run: `pnpm lint`

**Step 4: Commit**

```bash
git add apps/api/src/services/issue.ts apps/api/src/routes/issues.ts
git commit -m "feat(api): enrich listIssues with verification counts, relations, sort, category"
```

---

### Task 6: Update server actions for new API shape

**Files:**
- Modify: `apps/web/src/app/actions/feed.ts`
- Modify: `apps/web/src/app/actions/user.ts`
- Create: `apps/web/src/app/actions/explore.ts`

**Step 1: Update `feed.ts`**

Replace `apps/web/src/app/actions/feed.ts` entirely:

```typescript
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
  const res = await apiFetch("/stats");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch stats" }));
    throw new Error(err.error || "Failed to fetch stats");
  }
  return res.json() as Promise<{
    issues: number;
    patches: number;
    users: number;
    openCriticals: number;
    approvalRate: number;
    fixesReused: number;
    issuesResolved: number;
    verifiedThisWeek: number;
  }>;
}

export async function fetchEcosystemStats() {
  const res = await apiFetch("/stats/ecosystem");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch ecosystem stats" }));
    throw new Error(err.error || "Failed to fetch ecosystem stats");
  }
  return res.json() as Promise<
    Array<{
      ecosystem: string;
      issueCount: number;
      patchCount: number;
      resolutionRate: number;
      topLibraries: Array<{ library: string; issueCount: number }>;
    }>
  >;
}
```

**Step 2: Update `user.ts`**

Replace `apps/web/src/app/actions/user.ts` entirely:

```typescript
"use server";

import { apiFetch } from "@/lib/api";

export async function fetchCurrentUser() {
  const res = await apiFetch("/users/me");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch user" }));
    throw new Error(err.error || "Failed to fetch user");
  }
  return res.json();
}

export async function fetchUserStats(): Promise<{
  credits: number;
  issuesReported: number;
  issuesPatched: number;
  patchesSubmitted: number;
  patchesVerifiedFixed: number;
  verificationsGiven: number;
  verificationsFixed: number;
  verificationsNotFixed: number;
  verificationsPartial: number;
}> {
  const res = await apiFetch("/users/me/stats");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch stats" }));
    throw new Error(err.error || "Failed to fetch stats");
  }
  return res.json();
}

export async function fetchUserActivity(params: {
  type?: string;
  outcome?: string;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const res = await apiFetch(`/users/me/activity?${searchParams.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch activity" }));
    throw new Error(err.error || "Failed to fetch activity");
  }
  return res.json();
}

export async function fetchUserTransactions(params: {
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));

  const res = await apiFetch(`/users/me/transactions?${searchParams.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch transactions" }));
    throw new Error(err.error || "Failed to fetch transactions");
  }
  return res.json();
}
```

**Step 3: Create `explore.ts`**

Create `apps/web/src/app/actions/explore.ts`:

```typescript
"use server";

import { apiFetch } from "@/lib/api";

export async function fetchIssues(params: {
  library?: string;
  ecosystem?: string;
  status?: string;
  severity?: string;
  category?: string;
  sort?: string;
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const res = await apiFetch(`/issues?${searchParams.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch issues" }));
    throw new Error(err.error || "Failed to fetch issues");
  }
  return res.json();
}
```

**Step 4: Verify**

Run: `pnpm lint`

**Step 5: Commit**

```bash
git add apps/web/src/app/actions/feed.ts apps/web/src/app/actions/user.ts apps/web/src/app/actions/explore.ts
git commit -m "feat(web): update server actions for new API shape"
```

---

### Task 7: Update navigation (sidebar, keyboard, command palette, help dialog)

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx:18-22`
- Modify: `apps/web/src/hooks/use-keyboard-navigation.ts:61-74`
- Modify: `apps/web/src/components/command-palette.tsx:38-54`
- Modify: `apps/web/src/components/keyboard-help-dialog.tsx:27-31`

**Step 1: Update sidebar nav items**

In `apps/web/src/components/sidebar.tsx`, replace lines 18-22:

```typescript
const navItems = [
  { href: "/overview", label: "overview", icon: LayoutDashboard, shortcut: "G O" },
  { href: "/explore", label: "explore", icon: Activity, shortcut: "G E" },
  { href: "/your-agent", label: "your agent", icon: User, shortcut: "G A" },
];
```

**Step 2: Update keyboard navigation**

In `apps/web/src/hooks/use-keyboard-navigation.ts`, replace the switch block (lines 61-74):

```typescript
        switch (e.key) {
          case "o":
            e.preventDefault();
            router.push("/overview");
            break;
          case "e":
            e.preventDefault();
            router.push("/explore");
            break;
          case "a":
            e.preventDefault();
            router.push("/your-agent");
            break;
        }
```

**Step 3: Update command palette**

In `apps/web/src/components/command-palette.tsx`, replace the CommandGroup navigation items (lines 38-54):

```tsx
        <CommandGroup heading="navigation">
          <CommandItem onSelect={() => go("/overview")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            overview
            <CommandShortcut>G O</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/explore")}>
            <Activity className="mr-2 h-4 w-4" />
            explore
            <CommandShortcut>G E</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/your-agent")}>
            <User className="mr-2 h-4 w-4" />
            your agent
            <CommandShortcut>G A</CommandShortcut>
          </CommandItem>
        </CommandGroup>
```

**Step 4: Update keyboard help dialog**

In `apps/web/src/components/keyboard-help-dialog.tsx`, replace the navigation group (lines 27-31):

```typescript
      { keys: ["G", "O"], description: "go to overview" },
      { keys: ["G", "E"], description: "go to explore" },
      { keys: ["G", "A"], description: "go to your agent" },
```

**Step 5: Verify**

Run: `pnpm lint`

**Step 6: Commit**

```bash
git add apps/web/src/components/sidebar.tsx apps/web/src/hooks/use-keyboard-navigation.ts apps/web/src/components/command-palette.tsx apps/web/src/components/keyboard-help-dialog.tsx
git commit -m "feat(web): update navigation to overview/explore/your-agent"
```

---

### Task 8: Build Overview page

**Files:**
- Create: `apps/web/src/app/(dashboard)/overview/page.tsx`

**Step 1: Create the overview page**

Create `apps/web/src/app/(dashboard)/overview/page.tsx` as a `"use client"` component with three sections:

1. **Mission Metrics** — 4 cards in a row using the existing monospace metric style:
   - "fixes reused" → `stats.fixesReused`
   - "issues resolved" → `stats.issuesResolved`
   - "agents contributing" → `stats.users`
   - "verified this week" → `stats.verifiedThisWeek`

2. **Narrative Feed** — renders `fetchFeed({ limit: 30 })` results via the existing `ActivityFeed` component. Below the feed, a "load more" button that increments page and appends items.

3. **Ecosystem Breakdown** — renders `fetchEcosystemStats()`:
   - Section heading: "where the pain is" (monospace uppercase like existing headings)
   - One bordered card per ecosystem: name, issue count, patch count, resolution rate %, top libraries list
   - If empty: don't render section

Data fetching: `useEffect` + `useState` pattern (same as existing dashboard page). Loading state with `Skeleton` components.

Use: `PageHeader` ("overview"), `ActivityFeed`, `Skeleton` from existing components. Import `fetchAggregateStats`, `fetchEcosystemStats` from `@/app/actions/feed`, `fetchFeed` from same.

**Step 2: Verify**

Run: `pnpm lint`
Run: `pnpm dev`, navigate to `http://localhost:3000/overview`

**Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/overview/page.tsx
git commit -m "feat(web): build overview page with mission metrics, narrative feed, ecosystem breakdown"
```

---

### Task 9: Build Explore page

**Files:**
- Create: `apps/web/src/app/(dashboard)/explore/page.tsx`

**Step 1: Create the explore page**

Create `apps/web/src/app/(dashboard)/explore/page.tsx` as a `"use client"` component with:

1. **Filter Bar** — horizontal row, sticky:
   - Library: `<Input>` with debounced onChange (300ms), `placeholder="filter by library..."`
   - Ecosystem: `<select>` or shadcn `Select` with options: all, node, python, go, rust, other
   - Status: options: all, open, confirmed, patched, closed
   - Severity: options: all, critical, high, medium, low
   - Category: options: all, crash, build, types, performance, behavior, config, compatibility, install
   - Sort: options: most recent (default), most accessed, most patches

2. **Issue List** — renders `fetchIssues()` results:
   - Each item is a `Link` to `/issues/{id}`
   - Shows: title (or errorMessage fallback) + severity dot (reuse `SEVERITY_DOT` pattern from activity-feed) + status badge
   - `library@version` + ecosystem
   - Description truncated (`line-clamp-1`)
   - Stats row: `{_count.patches} patches · {verifiedFixCount} verified · {accessCount} agents reached`
   - If `relatedCount > 0`: `"linked to {relatedCount} others"` in muted text

3. **Empty state**: `"no issues found matching these filters. the memory grows with every agent that connects."`

4. **"load more" button** at bottom

Use existing components: `PageHeader`, `Input`, `Badge`, `Skeleton`, `ListItem`.

**Step 2: Verify**

Run: `pnpm lint`
Run: `pnpm dev`, navigate to `http://localhost:3000/explore`

**Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/explore/page.tsx
git commit -m "feat(web): build explore page with composable filters and issue list"
```

---

### Task 10: Build Your Agent page

**Files:**
- Create: `apps/web/src/app/(dashboard)/your-agent/page.tsx`

**Step 1: Create the your-agent page**

Create `apps/web/src/app/(dashboard)/your-agent/page.tsx` as a `"use client"` component with four sections:

1. **Agent Identity** — top:
   - Avatar + username (from `fetchCurrentUser()`)
   - "member since {date}" in muted text
   - Credit balance: `{credits} credits` (from `fetchUserStats().credits`)
   - MCP endpoint block with copy button (reuse pattern from current profile page — `process.env.NEXT_PUBLIC_API_URL + "/mcp"`)

2. **Impact Summary** — 3 monospace metric cards:
   - "issues reported": `{issuesReported}` with subtitle `"{issuesPatched} got patched"`
   - "patches submitted": `{patchesSubmitted}` with subtitle `"{patchesVerifiedFixed} verified as working"`
   - "verifications given": `{verificationsGiven}` with subtitle `"{verificationsFixed} fixed · {verificationsNotFixed} not fixed · {verificationsPartial} partial"`

3. **Contribution History** — renders `fetchUserActivity({ limit: 20 })`:
   - For `recent.bugs`: "you reported a issue in `{library}@{version}` — {patchCount} patches, {fixedCount} verified fixes". Link to `/issues/{id}`.
   - For `recent.patches`: "you patched `{library}@{version}` — {verificationTotal} verifications, {verificationFixed} fixed". Link to `/issues/{issueId}`.
   - For `recent.verifications`: "you verified a fix for `{issueTitle}` — {outcome}". Link to `/issues/{issueId}`.
   - If data from `actionable` array exists, show actionable items section

4. **Credit Ledger** — collapsible `<details>` element:
   - Summary: "credit history"
   - Body: renders `fetchUserTransactions({ limit: 20 })` as a list: date, amount (+/- with color), type, balance
   - "load more" at bottom

Use: `PageHeader` ("your agent"), `Avatar`, `Button`, `Skeleton`, same metric card pattern, `formatDate`, `relativeTime` from helpers.

**Step 2: Verify**

Run: `pnpm lint`
Run: `pnpm dev`, navigate to `http://localhost:3000/your-agent`

**Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/your-agent/page.tsx
git commit -m "feat(web): build your-agent page with impact summary, contribution history, credit ledger"
```

---

### Task 11: Enhance issue detail page

**Files:**
- Modify: `apps/web/src/app/(dashboard)/issues/[id]/issue-detail-client.tsx`

**Step 1: Surface searchHitCount**

In the header metadata area (near the `accessCount` display), add:

```tsx
{issue.searchHitCount > 0 && (
  <span className="text-xs text-muted-foreground">
    found in {issue.searchHitCount} searches
  </span>
)}
```

**Step 2: Add related issues section**

After the issue body sections and before the patches section, add a "related issues" section that renders `issue.relatedIssues`:

```tsx
{issue.relatedIssues && issue.relatedIssues.length > 0 && (
  <section className="space-y-2">
    <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
      related issues
    </h3>
    <div className="space-y-1.5">
      {issue.relatedIssues.map((rel: { id: string; type: string; title: string | null; library: string; version: string; confidence: number }) => (
        <Link
          key={rel.id}
          href={`/issues/${rel.id}`}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover"
        >
          <span className="text-muted-foreground">{rel.type.replace(/_/g, " ")}</span>
          <span className="font-medium">{rel.title ?? `${rel.library}@${rel.version}`}</span>
          {rel.confidence < 1.0 && (
            <span className="text-xs text-muted-foreground">
              {rel.confidence >= 0.7 ? "high confidence" : "moderate"}
            </span>
          )}
        </Link>
      ))}
    </div>
  </section>
)}
```

**Step 3: Surface errorBefore/errorAfter on verifications**

In the verification display within each patch row, after the existing verification info, add:

```tsx
{verification.errorBefore && (
  <div className="mt-1 text-xs">
    <span className="text-red-400">before:</span>{" "}
    <code className="text-muted-foreground">{verification.errorBefore}</code>
  </div>
)}
{verification.errorAfter && (
  <div className="mt-1 text-xs">
    <span className="text-green-400">after:</span>{" "}
    <code className="text-muted-foreground">{verification.errorAfter}</code>
  </div>
)}
```

**Step 4: Verify**

Run: `pnpm lint`

**Step 5: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/issues/\[id\]/issue-detail-client.tsx
git commit -m "feat(web): enhance issue detail with searchHitCount, related issues, error diffs"
```

---

### Task 12: Enhance patch detail page

**Files:**
- Modify: `apps/web/src/app/(dashboard)/patches/[id]/page.tsx`

**Step 1: Surface errorBefore/errorAfter on verifications**

Same pattern as Task 11 Step 3 — add error diff display to verification items.

**Step 2: Add "this fix also applies to" section**

After the verifications section, check if the patch's parent issue has relatedIssues with type `shared_fix`. If so, render:

```tsx
{sharedFixIssues.length > 0 && (
  <section className="space-y-2">
    <h3 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
      this fix also applies to
    </h3>
    <div className="space-y-1">
      {sharedFixIssues.map((rel) => (
        <Link key={rel.id} href={`/issues/${rel.id}`} className="block text-sm hover:underline">
          {rel.title || `${rel.library}@${rel.version}`}
        </Link>
      ))}
    </div>
  </section>
)}
```

Note: The `GET /patches/:id` response includes `issue` but may not include `issue.relatedIssues`. Check the patches route — if the response doesn't include related issues, expand the `getPatchById` service to load them via `loadRelatedIssues`.

**Step 3: Verify**

Run: `pnpm lint`

**Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/patches/\[id\]/page.tsx
git commit -m "feat(web): enhance patch detail with error diffs and shared-fix relations"
```

---

### Task 13: Add redirects and remove old pages

**Files:**
- Modify: `apps/web/next.config.ts`
- Delete: `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- Delete: `apps/web/src/app/(dashboard)/dashboard/loading.tsx`
- Delete: `apps/web/src/app/(dashboard)/activity/page.tsx`
- Delete: `apps/web/src/app/(dashboard)/profile/page.tsx`
- Delete: `apps/web/src/app/(dashboard)/profile/loading.tsx`

**Step 1: Add redirects to next.config.ts**

In `apps/web/next.config.ts`, add `redirects` to the config object:

```typescript
const nextConfig: NextConfig = {
  // ...existing config...
  async redirects() {
    return [
      { source: "/dashboard", destination: "/overview", permanent: true },
      { source: "/activity", destination: "/overview", permanent: true },
      { source: "/profile", destination: "/your-agent", permanent: true },
    ];
  },
};
```

**Step 2: Delete old page files**

```bash
rm apps/web/src/app/\(dashboard\)/dashboard/page.tsx
rm apps/web/src/app/\(dashboard\)/dashboard/loading.tsx
rm apps/web/src/app/\(dashboard\)/activity/page.tsx
rm apps/web/src/app/\(dashboard\)/profile/page.tsx
rm apps/web/src/app/\(dashboard\)/profile/loading.tsx
```

Then remove the empty directories:

```bash
rmdir apps/web/src/app/\(dashboard\)/dashboard
rmdir apps/web/src/app/\(dashboard\)/profile
```

Keep the `activity` directory only if it has other files; otherwise remove it too.

**Step 3: Verify**

Run: `pnpm lint`
Run: `pnpm dev`
- `/dashboard` should redirect to `/overview`
- `/activity` should redirect to `/overview`
- `/profile` should redirect to `/your-agent`

**Step 4: Commit**

```bash
git add -A
git commit -m "chore(web): remove old pages, add redirects to new routes"
```

---

### Task 14: Final integration verification

**Step 1: Full build**

Run: `pnpm build`
Expected: all packages and apps build without errors

**Step 2: Smoke test**

Run: `pnpm dev` and verify:

1. `/overview` — 4 mission metrics, narrative feed with "load more", ecosystem breakdown
2. `/explore` — filter bar with library/ecosystem/status/severity/category/sort, issue list with stats
3. `/your-agent` — identity + credits, impact summary with outcomes, contribution history, credit ledger
4. `/issues/{id}` — searchHitCount visible, related issues section, errorBefore/errorAfter on verifications
5. `/patches/{id}` — errorBefore/errorAfter, "this fix also applies to" section
6. Redirects: `/dashboard`→`/overview`, `/activity`→`/overview`, `/profile`→`/your-agent`
7. Sidebar: overview/explore/your agent with correct routes
8. Keyboard: G O, G E, G A work correctly
9. Cmd+K: shows overview/explore/your agent
10. `?` help: shows correct shortcut descriptions

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for dashboard redesign"
```
