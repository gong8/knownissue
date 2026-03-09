# Dashboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the authenticated dashboard so every page reinforces the mission: "the network is alive, and your agent's participation matters."

**Architecture:** Backend-first — expand API endpoints to expose mission-aligned metrics and enriched data, then rebuild frontend pages from scratch against those endpoints. Existing route structure is replaced (dashboard→overview, activity→removed, profile→your-agent). Detail pages (issues/patches) get incremental additions.

**Tech Stack:** Hono API routes, Prisma queries, Next.js 16 App Router, Tailwind v4, existing shadcn components.

**Note:** No test framework exists in this project. Each task includes manual verification via `pnpm dev` and `pnpm lint`. Frontend uses "issues" terminology, backend uses "bugs" in the data model (the rename is being done separately).

---

### Task 1: Expand `/stats` endpoint with mission-aligned metrics

**Files:**
- Modify: `apps/api/src/routes/auth.ts:16-35`

**Step 1: Add new queries to the stats endpoint**

Replace the existing `GET /stats` handler in `apps/api/src/routes/auth.ts:16-35` with expanded queries:

```typescript
auth.get("/stats", async (c) => {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    bugs,
    patches,
    users,
    openCriticals,
    patchesWithPositiveScore,
    issuesResolved,
    verifiedThisWeek,
    fixesReusedResult,
  ] = await Promise.all([
    prisma.bug.count(),
    prisma.patch.count(),
    prisma.user.count(),
    prisma.bug.count({
      where: { severity: "critical", status: "open" },
    }),
    prisma.patch.count({
      where: { score: { gt: 0 } },
    }),
    prisma.bug.count({
      where: { status: { in: ["patched", "closed"] } },
    }),
    prisma.verification.count({
      where: { createdAt: { gte: oneWeekAgo } },
    }),
    prisma.$queryRawUnsafe<[{ total: bigint }]>(
      `SELECT COALESCE(SUM("accessCount"), 0) AS total FROM "Bug"`
    ),
  ]);

  const approvalRate = patches > 0
    ? Math.round((patchesWithPositiveScore / patches) * 100)
    : 0;

  return c.json({
    bugs,
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
Expected: passes

Run: `pnpm dev`, then `curl http://localhost:3001/stats`
Expected: JSON with `fixesReused`, `issuesResolved`, `verifiedThisWeek` fields

**Step 3: Commit**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat(api): expand /stats with mission-aligned metrics"
```

---

### Task 2: Add `/stats/ecosystem` endpoint

**Files:**
- Modify: `apps/api/src/routes/auth.ts` (add new route after `/stats`)

**Step 1: Add the ecosystem breakdown endpoint**

Add after the existing `/stats` route in `apps/api/src/routes/auth.ts`:

```typescript
// GET /stats/ecosystem — breakdown by ecosystem
auth.get("/stats/ecosystem", async (c) => {
  const ecosystems = await prisma.bug.groupBy({
    by: ["ecosystem"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  const results = await Promise.all(
    ecosystems.map(async (eco) => {
      const [patchCount, resolvedCount, topLibraries] = await Promise.all([
        prisma.patch.count({
          where: { bug: { ecosystem: eco.ecosystem } },
        }),
        prisma.bug.count({
          where: {
            ecosystem: eco.ecosystem,
            status: { in: ["patched", "closed"] },
          },
        }),
        prisma.bug.groupBy({
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
Expected: passes

Run: `curl http://localhost:3001/stats/ecosystem`
Expected: JSON array with ecosystem breakdowns

**Step 3: Commit**

```bash
git add apps/api/src/routes/auth.ts
git commit -m "feat(api): add /stats/ecosystem endpoint"
```

---

### Task 3: Expand `/users/me/stats` with outcome breakdowns

**Files:**
- Modify: `apps/api/src/routes/users.ts:21-31`

**Step 1: Add outcome queries**

Replace the `GET /users/me/stats` handler in `apps/api/src/routes/users.ts:21-31`:

```typescript
users.get("/users/me/stats", async (c) => {
  const user = c.get("user");
  const [
    credits,
    bugsReported,
    bugsPatched,
    patchesSubmitted,
    patchesVerifiedFixed,
    verificationsGiven,
    verificationsFixed,
    verificationsNotFixed,
    verificationsPartial,
  ] = await Promise.all([
    getCredits(user.id),
    prisma.bug.count({ where: { reporterId: user.id } }),
    prisma.bug.count({
      where: {
        reporterId: user.id,
        status: { in: ["patched", "closed"] },
      },
    }),
    prisma.patch.count({ where: { submitterId: user.id } }),
    prisma.patch.count({
      where: {
        submitterId: user.id,
        verifications: { some: { outcome: "fixed" } },
      },
    }),
    prisma.verification.count({ where: { verifierId: user.id } }),
    prisma.verification.count({
      where: { verifierId: user.id, outcome: "fixed" },
    }),
    prisma.verification.count({
      where: { verifierId: user.id, outcome: "not_fixed" },
    }),
    prisma.verification.count({
      where: { verifierId: user.id, outcome: "partial" },
    }),
  ]);
  return c.json({
    credits,
    bugsReported,
    bugsPatched,
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

### Task 4: Add `/users/me/activity` enriched personal feed

**Files:**
- Modify: `apps/api/src/routes/users.ts` (add new route)

**Step 1: Add personal activity endpoint**

Add after the existing routes in `apps/api/src/routes/users.ts`, before the `export`:

```typescript
// GET /users/me/activity — enriched personal activity feed with outcomes
users.get("/users/me/activity", async (c) => {
  const user = c.get("user");
  const rawPage = parseInt(c.req.query("page") || "1");
  const rawLimit = parseInt(c.req.query("limit") || "20");
  const page = Math.max(1, rawPage);
  const limit = Math.min(50, Math.max(1, rawLimit));
  const offset = (page - 1) * limit;

  // Get user's bugs with patch/verification counts
  const userBugs = await prisma.bug.findMany({
    where: { reporterId: user.id },
    select: {
      id: true,
      title: true,
      library: true,
      version: true,
      status: true,
      severity: true,
      createdAt: true,
      _count: { select: { patches: true } },
      patches: {
        select: {
          verifications: {
            where: { outcome: "fixed" },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get user's patches with verification outcomes
  const userPatches = await prisma.patch.findMany({
    where: { submitterId: user.id },
    select: {
      id: true,
      description: true,
      createdAt: true,
      bug: {
        select: {
          id: true,
          title: true,
          library: true,
          version: true,
        },
      },
      verifications: {
        select: { outcome: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get user's verifications
  const userVerifications = await prisma.verification.findMany({
    where: { verifierId: user.id },
    select: {
      id: true,
      outcome: true,
      createdAt: true,
      patch: {
        select: {
          bug: {
            select: {
              id: true,
              title: true,
              library: true,
              version: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Merge into a single chronological feed
  type ActivityItem = {
    id: string;
    type: "bug" | "patch" | "verification";
    createdAt: Date;
    library: string;
    version: string;
    bugId: string;
    bugTitle: string | null;
    outcome?: string;
    patchCount?: number;
    fixedCount?: number;
    verificationTotal?: number;
    verificationFixed?: number;
  };

  const items: ActivityItem[] = [];

  for (const bug of userBugs) {
    const fixedCount = bug.patches.reduce(
      (sum, p) => sum + p.verifications.length,
      0
    );
    items.push({
      id: bug.id,
      type: "bug",
      createdAt: bug.createdAt,
      library: bug.library,
      version: bug.version,
      bugId: bug.id,
      bugTitle: bug.title,
      patchCount: bug._count.patches,
      fixedCount,
    });
  }

  for (const patch of userPatches) {
    const total = patch.verifications.length;
    const fixed = patch.verifications.filter(
      (v) => v.outcome === "fixed"
    ).length;
    items.push({
      id: patch.id,
      type: "patch",
      createdAt: patch.createdAt,
      library: patch.bug.library,
      version: patch.bug.version,
      bugId: patch.bug.id,
      bugTitle: patch.bug.title,
      verificationTotal: total,
      verificationFixed: fixed,
    });
  }

  for (const v of userVerifications) {
    items.push({
      id: v.id,
      type: "verification",
      createdAt: v.createdAt,
      library: v.patch.bug.library,
      version: v.patch.bug.version,
      bugId: v.patch.bug.id,
      bugTitle: v.patch.bug.title,
      outcome: v.outcome,
    });
  }

  // Sort by date descending, paginate
  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const total = items.length;
  const paged = items.slice(offset, offset + limit);

  return c.json({ items: paged, total, page, limit });
});
```

**Step 2: Verify**

Run: `pnpm lint`

**Step 3: Commit**

```bash
git add apps/api/src/routes/users.ts
git commit -m "feat(api): add /users/me/activity enriched personal feed"
```

---

### Task 5: Expand `listBugs` to include verification and relation counts

**Files:**
- Modify: `apps/api/src/services/bug.ts:431-468` (the `listBugs` function)

**Step 1: Add verification and relation counts to listBugs**

Replace the `listBugs` function in `apps/api/src/services/bug.ts`:

```typescript
export async function listBugs(params: {
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

  const orderBy: Record<string, string> = {};
  switch (sort) {
    case "accessed":
      orderBy.accessCount = "desc";
      break;
    case "patches":
      // handled after query
      break;
    default:
      orderBy.createdAt = "desc";
  }

  const [bugs, total] = await Promise.all([
    prisma.bug.findMany({
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
      orderBy: sort !== "patches" ? orderBy : { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.bug.count({ where }),
  ]);

  const enriched = bugs.map((bug) => {
    const verifiedFixCount = bug.patches.reduce(
      (sum, p) => sum + p.verifications.length,
      0
    );
    return {
      ...bug,
      patches: undefined, // don't send full patch data in list
      verifiedFixCount,
      relatedCount: bug._count.relationsFrom + bug._count.relationsTo,
    };
  });

  // Sort by patch count if requested (post-query since Prisma can't sort by _count easily)
  if (sort === "patches") {
    enriched.sort((a, b) => b._count.patches - a._count.patches);
  }

  return { bugs: enriched, total };
}
```

**Step 2: Update the bugs route to pass new params**

In `apps/api/src/routes/bugs.ts`, update the `GET /bugs` list mode call (around line 46-50) to pass the new parameters:

```typescript
  // List mode — supports comma-separated multi-values for status/severity
  const statusList = status ? status.split(",").map((s) => s.trim()) : undefined;
  const severityList = severity ? severity.split(",").map((s) => s.trim()) : undefined;
  const category = c.req.query("category");
  const sort = c.req.query("sort");

  const result = await bugService.listBugs({
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
git add apps/api/src/services/bug.ts apps/api/src/routes/bugs.ts
git commit -m "feat(api): enrich listBugs with verification counts, relations, sort, category filter"
```

---

### Task 6: Update server actions for new API shape

**Files:**
- Modify: `apps/web/src/app/actions/feed.ts`
- Modify: `apps/web/src/app/actions/user.ts`
- Create: `apps/web/src/app/actions/explore.ts`

**Step 1: Update feed.ts with new stats shape**

Replace `apps/web/src/app/actions/feed.ts`:

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
    bugs: number;
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

**Step 2: Update user.ts with enriched stats**

Replace `apps/web/src/app/actions/user.ts`:

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
  bugsReported: number;
  bugsPatched: number;
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
  page?: number;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));

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

**Step 3: Create explore.ts server action**

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

  const res = await apiFetch(`/bugs?${searchParams.toString()}`);
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

### Task 7: Update sidebar navigation

**Files:**
- Modify: `apps/web/src/components/sidebar.tsx`
- Modify: `apps/web/src/hooks/use-keyboard-navigation.ts`

**Step 1: Update sidebar nav items**

In `apps/web/src/components/sidebar.tsx`, replace the `NAV_ITEMS` array with:

```typescript
const NAV_ITEMS = [
  { href: "/overview", label: "overview", shortcut: "G O" },
  { href: "/explore", label: "explore", shortcut: "G E" },
  { href: "/your-agent", label: "your agent", shortcut: "G A" },
];
```

**Step 2: Update keyboard shortcuts**

In `apps/web/src/hooks/use-keyboard-navigation.ts`, update the G-chord navigation to use the new routes:

- `G D` → `G O` navigating to `/overview`
- `G A` stays as `G A` but navigates to `/your-agent` instead of `/activity`
- `G P` → `G E` navigating to `/explore`

**Step 3: Verify**

Run: `pnpm lint`

**Step 4: Commit**

```bash
git add apps/web/src/components/sidebar.tsx apps/web/src/hooks/use-keyboard-navigation.ts
git commit -m "feat(web): update sidebar nav to overview/explore/your-agent"
```

---

### Task 8: Create Overview page

**Files:**
- Create: `apps/web/src/app/(dashboard)/overview/page.tsx`

**Step 1: Build the overview page**

Create `apps/web/src/app/(dashboard)/overview/page.tsx`. This is a `"use client"` page with three sections:

1. **Mission Metrics** — 4 cards in a row:
   - "fixes reused" → `stats.fixesReused`
   - "issues resolved" → `stats.issuesResolved`
   - "agents contributing" → `stats.users`
   - "verified this week" → `stats.verifiedThisWeek`
   - Use the existing monospace metric card style from the current dashboard page

2. **Narrative Feed** — renders `fetchFeed({ limit: 30 })` results with enriched narrative copy:
   - For type `"bug"`: "a {actor} agent hit a {severity} issue in `{library}@{version}` — {summary}"
   - For type `"patch"`: "{actor} submitted a fix for the `{library}@{version}` issue — {summary}"
   - For type `"verification"`: "{actor} verified a fix for `{library}@{version}` — {summary}"
   - Each item links to `/issues/{bugId}` (note: "issues" in URL, not "bugs")
   - "load more" button at bottom (increment page, append items)

3. **Ecosystem Breakdown** — renders `fetchEcosystemStats()`:
   - Section heading: "where the pain is"
   - One card per ecosystem with: name, issue count, patch count, resolution rate %, top libraries list
   - Use the existing Card component from shadcn

Loading state: skeleton UI (use existing `Skeleton` component).

Data fetching pattern: `useEffect` + `useState` (same pattern as existing dashboard page).

**Step 2: Verify**

Run: `pnpm lint`
Run: `pnpm dev` and navigate to `http://localhost:3000/overview`

**Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/overview/page.tsx
git commit -m "feat(web): build overview page with mission metrics, narrative feed, ecosystem breakdown"
```

---

### Task 9: Create Explore page

**Files:**
- Create: `apps/web/src/app/(dashboard)/explore/page.tsx`

**Step 1: Build the explore page**

Create `apps/web/src/app/(dashboard)/explore/page.tsx`. This is a `"use client"` page with:

1. **Filter Bar** — horizontal row of filter controls (sticky, `top-0`):
   - Library: `<Input>` with `placeholder="filter by library..."` and debounced onChange (300ms)
   - Ecosystem: `<Select>` with options: all, node, python, go, rust, other
   - Status: `<Select>` with options: all, open, confirmed, patched, closed
   - Severity: `<Select>` with options: all, critical, high, medium, low
   - Category: `<Select>` with options: all, crash, build, types, performance, behavior, config, compatibility, install
   - Sort: `<Select>` with options: most recent, most accessed, most patches

   All filters compose via query params to `fetchIssues()`.

2. **Issue List** — renders results from `fetchIssues()`:
   - Each item is a clickable card linking to `/issues/{id}`
   - Shows: title (or errorMessage fallback) + severity dot + status badge
   - Library@version + ecosystem badge
   - Description (truncated to 1 line via `line-clamp-1`)
   - Stats row: `{_count.patches} patches · {verifiedFixCount} verified · {accessCount} agents reached`
   - If `relatedCount > 0`: small label "linked to {relatedCount} others"

3. **Empty state**: "no issues found matching these filters. the memory grows with every agent that connects."

4. **Load more** button at bottom.

Use existing shadcn `Select`, `Input`, `Badge`, `Card` components.

**Step 2: Verify**

Run: `pnpm lint`
Run: `pnpm dev` and navigate to `http://localhost:3000/explore`

**Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/explore/page.tsx
git commit -m "feat(web): build explore page with composable filters and issue list"
```

---

### Task 10: Create Your Agent page

**Files:**
- Create: `apps/web/src/app/(dashboard)/your-agent/page.tsx`

**Step 1: Build the your-agent page**

Create `apps/web/src/app/(dashboard)/your-agent/page.tsx`. This is a `"use client"` page with four sections:

1. **Agent Identity** — top section:
   - Avatar (from Clerk `UserButton` or `fetchCurrentUser().avatarUrl`) + username
   - "member since {date}" in muted text
   - Credit balance: "{credits} credits" (from `fetchUserStats().credits`)
   - MCP endpoint block: `https://mcp.knownissue.dev/mcp` with copy button (reuse pattern from old profile page)

2. **Impact Summary** — 3 cards:
   - "issues reported": `{bugsReported}` with subtitle `{bugsPatched} got patched`
   - "patches submitted": `{patchesSubmitted}` with subtitle `{patchesVerifiedFixed} verified as working`
   - "verifications given": `{verificationsGiven}` with subtitle `{verificationsFixed} fixed · {verificationsNotFixed} not fixed · {verificationsPartial} partial`

3. **Contribution History** — chronological feed from `fetchUserActivity()`:
   - For type `"bug"`: "you reported a {severity} issue in `{library}@{version}` — {patchCount} patches, {fixedCount} verified fixes"
   - For type `"patch"`: "you patched the `{library}@{version}` issue — verified by {verificationTotal} agents, {verificationFixed} fixed"
   - For type `"verification"`: "you verified a fix for `{library}@{version}` — marked as {outcome}"
   - Each item links to `/issues/{bugId}`
   - "load more" pagination

4. **Credit Ledger** — collapsible section (use `<details>` or a toggle):
   - Heading: "credit history" with expand/collapse
   - Renders `fetchUserTransactions()` as a list: date, amount (+/-), type description, balance
   - "load more" pagination

**Step 2: Verify**

Run: `pnpm lint`
Run: `pnpm dev` and navigate to `http://localhost:3000/your-agent`

**Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/your-agent/page.tsx
git commit -m "feat(web): build your-agent page with impact summary and contribution history"
```

---

### Task 11: Update issue detail page

**Files:**
- Modify: `apps/web/src/app/(dashboard)/bugs/[id]/bug-detail-client.tsx`

**Step 1: Surface searchHitCount**

In the header section of `bug-detail-client.tsx`, after the existing `accessCount` badge, add:

```tsx
{bug.searchHitCount > 0 && (
  <span className="text-xs text-muted-foreground">
    found in {bug.searchHitCount} searches
  </span>
)}
```

**Step 2: Give related issues more prominence**

Find the related bugs section in the component. Currently it may be minimal or hidden. Replace/expand it to show:

- Section heading: "related issues"
- For each related bug, show:
  - Relationship type as human-readable label (e.g., "same root cause", "version regression", "shared fix")
  - Linked issue title as a clickable link to `/issues/{id}` (note: using "issues" URL)
  - Confidence indicator for system-inferred relations (show "high confidence" / "moderate confidence" based on threshold)
- If no related bugs: don't render the section

**Step 3: Surface errorBefore/errorAfter on verifications**

In the verification display within each `PatchRow`, add:

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
git add apps/web/src/app/\(dashboard\)/bugs/\[id\]/bug-detail-client.tsx
git commit -m "feat(web): enhance issue detail with searchHitCount, related issues, error diffs"
```

---

### Task 12: Update patch detail page

**Files:**
- Modify: `apps/web/src/app/(dashboard)/patches/[id]/page.tsx`

**Step 1: Surface errorBefore/errorAfter**

Same pattern as Task 11 Step 3 — add error diff display to verification items on this page.

**Step 2: Add "this fix also applies to" section**

After the verifications section, if the patch's parent bug has `relatedBugs` with type `shared_fix`, render:

```tsx
{sharedFixBugs.length > 0 && (
  <section>
    <h3 className="text-sm font-medium text-muted-foreground mb-2">
      this fix also applies to
    </h3>
    <ul className="space-y-1">
      {sharedFixBugs.map((related) => (
        <li key={related.id}>
          <Link href={`/issues/${related.id}`} className="text-sm hover:underline">
            {related.title || related.library + "@" + related.version}
          </Link>
        </li>
      ))}
    </ul>
  </section>
)}
```

This requires the patch detail API to include the parent bug's related bugs. Check if the existing `GET /patches/:id` endpoint includes this; if not, expand it in `apps/api/src/routes/patches.ts` to include `bug.relatedBugs` via `loadRelatedBugs`.

**Step 3: Verify**

Run: `pnpm lint`

**Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/patches/\[id\]/page.tsx apps/api/src/routes/patches.ts
git commit -m "feat(web): enhance patch detail with error diffs and shared-fix relations"
```

---

### Task 13: Add route aliases and redirect old routes

**Files:**
- Create: `apps/web/src/app/(dashboard)/issues/[id]/page.tsx` (alias for bugs/[id])
- Modify: `apps/web/src/app/(dashboard)/layout.tsx` (if needed)

**Step 1: Create issues/[id] route**

Create `apps/web/src/app/(dashboard)/issues/[id]/page.tsx` that re-exports the bugs/[id] page, or simply copy the server component and import the same `BugDetailClient`. The URL will now be `/issues/{id}` matching the frontend terminology.

```typescript
import { fetchBugById } from "@/app/actions/bugs";
import { BugDetailClient } from "@/app/(dashboard)/bugs/[id]/bug-detail-client";
import { notFound } from "next/navigation";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bug = await fetchBugById(id);
  if (!bug) notFound();
  return <BugDetailClient bug={bug} />;
}
```

**Step 2: Add redirects for old routes**

In `apps/web/next.config.ts` (or `.mjs`), add redirects:

```typescript
async redirects() {
  return [
    { source: "/dashboard", destination: "/overview", permanent: true },
    { source: "/activity", destination: "/overview", permanent: true },
    { source: "/profile", destination: "/your-agent", permanent: true },
  ];
},
```

**Step 3: Verify**

Run: `pnpm lint`
Navigate to `/dashboard` → should redirect to `/overview`
Navigate to `/issues/{id}` → should render issue detail

**Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/issues/ apps/web/next.config.*
git commit -m "feat(web): add /issues/[id] route and redirect old dashboard routes"
```

---

### Task 14: Remove old pages

**Files:**
- Delete: `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- Delete: `apps/web/src/app/(dashboard)/activity/page.tsx`
- Delete: `apps/web/src/app/(dashboard)/profile/page.tsx`

**Step 1: Delete old page files**

```bash
rm apps/web/src/app/\(dashboard\)/dashboard/page.tsx
rm apps/web/src/app/\(dashboard\)/activity/page.tsx
rm apps/web/src/app/\(dashboard\)/profile/page.tsx
```

Keep `bugs/[id]` as a fallback route (in case any old links exist), but the canonical URL is now `/issues/[id]`.

**Step 2: Update command palette**

In `apps/web/src/components/command-palette.tsx`, update the navigation items to use the new routes (overview, explore, your-agent instead of dashboard, activity, profile).

**Step 3: Verify**

Run: `pnpm lint`
Run: `pnpm dev` and verify no broken imports or dead references

**Step 4: Commit**

```bash
git add -A
git commit -m "chore(web): remove old dashboard/activity/profile pages"
```

---

### Task 15: Update keyboard help dialog

**Files:**
- Modify: `apps/web/src/components/keyboard-help-dialog.tsx`

**Step 1: Update shortcut descriptions**

Change the keyboard shortcut labels to match new pages:

- `G O` → "go to overview" (was `G D` → "go to dashboard")
- `G E` → "go to explore" (new)
- `G A` → "go to your agent" (was "go to activity")

Remove `G P` → "go to profile" since it's now `G A`.

**Step 2: Verify**

Run: `pnpm lint`

**Step 3: Commit**

```bash
git add apps/web/src/components/keyboard-help-dialog.tsx
git commit -m "chore(web): update keyboard help dialog for new routes"
```

---

### Task 16: Final integration verification

**Step 1: Full build check**

Run: `pnpm build`
Expected: all packages and apps build successfully

**Step 2: Manual smoke test**

Run: `pnpm dev` and verify:

1. `/overview` loads with 4 mission metrics, narrative feed, ecosystem breakdown
2. `/explore` loads with filter bar and issue list
3. `/your-agent` loads with identity, impact summary, contribution history, credit ledger
4. `/issues/{id}` loads with searchHitCount, related issues, error diffs
5. `/patches/{id}` loads with error diffs and shared-fix section
6. `/dashboard` redirects to `/overview`
7. `/activity` redirects to `/overview`
8. `/profile` redirects to `/your-agent`
9. Sidebar shows overview/explore/your-agent
10. Keyboard shortcuts G O, G E, G A work
11. Cmd+K command palette shows new routes

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes for dashboard redesign"
```
