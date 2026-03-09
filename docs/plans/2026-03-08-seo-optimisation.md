# SEO Optimisation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make knownissue.dev discoverable by search engines and shareable on social media.

**Architecture:** Make bug detail pages publicly readable (server component refactor + Clerk/API auth changes). Add robots.txt, dynamic sitemap, per-page metadata with OG images, JSON-LD structured data, and Vercel Analytics. Fix heading hierarchy and improve error pages.

**Tech Stack:** Next.js 16 App Router (Metadata API, `next/og`, `next/image`), Clerk middleware, Hono API, `@vercel/analytics`

---

### Task 1: Make API Bug Endpoints Public (GET only)

**Files:**
- Modify: `apps/api/src/routes/bugs.ts`
- Modify: `apps/api/src/middleware/auth.ts`

**Step 1: Create an optional auth middleware**

In `apps/api/src/middleware/auth.ts`, add a new export `optionalAuthMiddleware` that works like `authMiddleware` but does NOT throw on missing/invalid tokens — it just calls `next()` with no user set. The logic is identical to `authMiddleware` except:
- Missing `Authorization` header → call `next()` instead of throwing
- Empty token → call `next()` instead of throwing
- All catch blocks and the final fallback → call `next()` instead of throwing

Export it as a named export alongside `authMiddleware`.

**Step 2: Restructure bug routes — public GETs, auth-protected writes**

Replace the blanket `bugs.use("/*", authMiddleware)` in `apps/api/src/routes/bugs.ts`. Instead:
- `GET /bugs` uses `optionalAuthMiddleware`. If `?q=` is present (search mode), check `c.get("user")` — if null, return 401 ("Authentication required for search"). List mode works without auth.
- `GET /bugs/:id` uses `optionalAuthMiddleware`. No auth check needed.
- `POST /bugs` uses `authMiddleware` (unchanged).

Import both middlewares:
```typescript
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth";
```

Apply per-route instead of blanket:
```typescript
bugs.get("/bugs", optionalAuthMiddleware, async (c) => { ... });
bugs.get("/bugs/:id", optionalAuthMiddleware, async (c) => { ... });
bugs.post("/bugs", authMiddleware, async (c) => { ... });
```

**Step 3: Verify**

Run: `pnpm build` from repo root
Expected: clean build

**Step 4: Commit**

```bash
git add apps/api/src/middleware/auth.ts apps/api/src/routes/bugs.ts
git commit -m "feat(api): make GET /bugs and GET /bugs/:id publicly accessible"
```

---

### Task 2: Make Bug Pages Public in Clerk Middleware

**Files:**
- Modify: `apps/web/src/proxy.ts`

**Step 1: Add bug detail routes to public matcher**

```typescript
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/bugs/:id",
]);
```

**Step 2: Commit**

```bash
git add apps/web/src/proxy.ts
git commit -m "feat(web): make /bugs/:id publicly accessible for SEO"
```

---

### Task 3: Refactor Bug Detail Page to Server Component

The current `/bugs/[id]/page.tsx` is entirely `"use client"` — it fetches data in `useEffect`. To enable `generateMetadata()`, split it into a server component wrapper + client child.

**Files:**
- Modify: `apps/web/src/app/(dashboard)/bugs/[id]/page.tsx` — becomes server component
- Create: `apps/web/src/app/(dashboard)/bugs/[id]/bug-detail-client.tsx` — client component (extracted from current page)

**Step 1: Create the client component**

Move the entire current content of `page.tsx` into `bug-detail-client.tsx` with these changes:
- Remove `useParams` — receive `bugId` and `initialBug` as props
- Remove the initial `useEffect` data fetch — use `initialBug` prop as initial state (no loading/null states needed)
- Keep `"use client"` directive
- Keep all interactive state (voting, patch submission, keyboard nav)
- Add a `useEffect` to fetch current user for ownership checks (fails silently for unauthenticated)
- Export as named export: `export function BugDetailClient({ bugId, initialBug }: { bugId: string; initialBug: Bug })`

**Step 2: Rewrite page.tsx as a server component**

```typescript
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fetchBugById } from "@/app/actions/bugs";
import { BugDetailClient } from "./bug-detail-client";

const BASE_URL = "https://knownissue.dev";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const bug = await fetchBugById(id);

  if (!bug) {
    return { title: "Bug not found" };
  }

  const description = bug.description.slice(0, 160);
  const url = `${BASE_URL}/bugs/${bug.id}`;

  return {
    title: bug.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: bug.title,
      description,
      url,
      type: "article",
      publishedTime: bug.createdAt,
      tags: bug.tags,
      images: [{ url: `${BASE_URL}/og/${bug.id}`, width: 1200, height: 630, alt: bug.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: bug.title,
      description,
      images: [`${BASE_URL}/og/${bug.id}`],
    },
  };
}

export default async function BugDetailPage({ params }: Props) {
  const { id } = await params;
  const bug = await fetchBugById(id);
  if (!bug) notFound();
  return <BugDetailClient bugId={id} initialBug={bug} />;
}
```

Note: `title` is just a plain string — the root layout's `title.template` ("%s — [knownissue]") appends the branding automatically.

**Step 3: Verify**

Run: `pnpm build` from repo root
Expected: clean build

**Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/bugs/\[id\]/page.tsx apps/web/src/app/\(dashboard\)/bugs/\[id\]/bug-detail-client.tsx
git commit -m "refactor(web): split bug detail into server + client components for SSR/SEO"
```

---

### Task 4: Add `robots.ts` and `sitemap.ts`

**Files:**
- Create: `apps/web/src/app/robots.ts`
- Create: `apps/web/src/app/sitemap.ts`

**Step 1: Create robots.ts**

```typescript
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/bugs/*"],
        disallow: ["/dashboard", "/profile", "/sign-in", "/sign-up"],
      },
    ],
    sitemap: "https://knownissue.dev/sitemap.xml",
  };
}
```

**Step 2: Create sitemap.ts**

Fetches bugs directly from the API (no auth needed after Task 1). Uses `next: { revalidate: 3600 }` to cache for 1 hour.

```typescript
import type { MetadataRoute } from "next";

const BASE_URL = "https://knownissue.dev";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
  ];

  try {
    const res = await fetch(`${API_URL}/bugs?limit=1000`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const { bugs } = await res.json();
      for (const bug of bugs) {
        entries.push({
          url: `${BASE_URL}/bugs/${bug.id}`,
          lastModified: new Date(bug.updatedAt),
          changeFrequency: "weekly",
          priority: 0.8,
        });
      }
    }
  } catch {
    // Sitemap still works with just the homepage
  }

  return entries;
}
```

**Step 3: Commit**

```bash
git add apps/web/src/app/robots.ts apps/web/src/app/sitemap.ts
git commit -m "feat(web): add robots.txt and dynamic sitemap"
```

---

### Task 5: Root Layout Metadata + `metadataBase`

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

**Step 1: Enhance root metadata**

Replace the existing `metadata` export with:

```typescript
export const metadata: Metadata = {
  metadataBase: new URL("https://knownissue.dev"),
  title: {
    default: "[knownissue] — stop hallucinating fixes",
    template: "%s — [knownissue]",
  },
  description:
    "Community-curated knowledge base of production bugs, patches, and workarounds — built for AI coding agents.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    siteName: "[knownissue]",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
};
```

**Step 2: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(web): add metadataBase, OG defaults, and title template to root layout"
```

---

### Task 6: Dynamic OG Image Route

**Files:**
- Create: `apps/web/src/app/og/[id]/route.tsx`

**Step 1: Create the OG image route**

Uses `ImageResponse` from `next/og` to render a branded card with bug title, severity dot, library@version, and [knownissue] branding. Returns a 1200x630 PNG.

The route fetches the bug from the API directly (no auth needed). Renders a dark background (#09090b) with white text, monospace font, severity-colored dot, and library badge.

Severity dot colours: critical=#f87171, high=#fb923c, medium=#facc15, low=#a1a1aa.

Fallback for missing bugs: simple "[knownissue] — bug not found" text.

Truncate bug titles longer than 80 characters with "...".

**Step 2: Commit**

```bash
git add apps/web/src/app/og/\[id\]/route.tsx
git commit -m "feat(web): add dynamic OG image generation for bug pages"
```

---

### Task 7: JSON-LD Structured Data

**Files:**
- Modify: `apps/web/src/app/page.tsx` — add Organization schema
- Modify: `apps/web/src/app/(dashboard)/bugs/[id]/page.tsx` — add TechArticle + BreadcrumbList schema

**Important — safe JSON-LD serialization:**

`JSON.stringify()` does not escape `</script>` sequences. Use this safe serializer everywhere JSON-LD is rendered:

```typescript
function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
```

This prevents XSS if any bug title/description contains `</script>`. Use it with Next.js metadata `script` approach or inline script tags.

**Step 1: Add Organization JSON-LD to homepage**

Add a `<script type="application/ld+json">` before the closing `</div>` in the Home component. Content: Organization schema with name "knownissue", url "https://knownissue.dev", and the site description. Use `safeJsonLd()` for serialization.

**Step 2: Add TechArticle + BreadcrumbList JSON-LD to bug detail server component**

In `page.tsx`, render a `<script type="application/ld+json">` before `<BugDetailClient>` (wrap both in a fragment). The JSON-LD `@graph` contains:
- `TechArticle`: headline, description (first 300 chars), author (githubUsername), datePublished, dateModified, keywords (tags), url
- `BreadcrumbList`: Home → Bugs → {bug.title}

Use `safeJsonLd()` for serialization.

**Step 3: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/\(dashboard\)/bugs/\[id\]/page.tsx
git commit -m "feat(web): add JSON-LD structured data (Organization, TechArticle, BreadcrumbList)"
```

---

### Task 8: Install and Configure Vercel Analytics

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/app/layout.tsx`

**Step 1: Install `@vercel/analytics`**

Run from repo root:
```bash
pnpm add @vercel/analytics --filter @knownissue/web
```

**Step 2: Add `<Analytics />` to root layout**

```typescript
import { Analytics } from "@vercel/analytics/next";
```

Add `<Analytics />` inside `<body>` alongside `<Toaster>`.

**Step 3: Commit**

```bash
git add apps/web/package.json apps/web/src/app/layout.tsx pnpm-lock.yaml
git commit -m "feat(web): add Vercel Analytics"
```

---

### Task 9: Fix Heading Hierarchy on Homepage

**Files:**
- Modify: `apps/web/src/app/page.tsx`

**Step 1: Change `<h3>` to `<h2>` in value props section**

In section 4 ("Value Props"), change all three `<h3>` elements to `<h2>`. The classNames stay the same — the visual size is controlled by CSS, not the heading level.

Affected headings: "mcp-native search", "community-verified patches", "earn credits, build reputation"

**Step 2: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "fix(web): correct heading hierarchy — h3 to h2 in value props"
```

---

### Task 10: Improve Error Pages

**Files:**
- Modify: `apps/web/src/app/not-found.tsx`
- Modify: `apps/web/src/app/error.tsx`

**Step 1: Improve not-found.tsx**

- Add a large "404" in monospace font above the heading
- Change heading to lowercase ("page not found") for brand consistency
- Add two navigation links: "home" (primary button to `/`) and "dashboard" (outline button to `/dashboard`)
- Use `font-mono` on buttons for brand consistency

**Step 2: Improve error.tsx**

- Add a large "500" in monospace font above the heading
- Change heading to lowercase ("something went wrong")
- Add a "home" link alongside the "try again" button
- Use `font-mono` on buttons

**Step 3: Commit**

```bash
git add apps/web/src/app/not-found.tsx apps/web/src/app/error.tsx
git commit -m "fix(web): improve 404 and error pages with navigation and branding"
```

---

### Task 11: Image Optimisation — `next/image` for Avatars

**Files:**
- Modify: `apps/web/next.config.ts` — add `images.remotePatterns`
- Modify: `apps/web/src/components/ui/avatar.tsx` — use `next/image`

**Step 1: Add GitHub avatar domain to next.config.ts**

Add `images.remotePatterns` to allow `avatars.githubusercontent.com`:

```typescript
images: {
  remotePatterns: [
    { protocol: "https", hostname: "avatars.githubusercontent.com" },
  ],
},
```

**Step 2: Update AvatarImage to use next/image**

Import `Image` from `next/image`. Modify `AvatarImage` to:
- Destructure `src` and `alt` from props
- Add `asChild` to `AvatarPrimitive.Image`
- Render `<Image src={src} alt={alt ?? ""} fill sizes="40px" />` as the child when `src` is truthy
- Render `<span />` as child when `src` is falsy (triggers Radix fallback)

**Step 3: Verify**

Run: `pnpm build` from repo root
Expected: clean build

**Step 4: Commit**

```bash
git add apps/web/next.config.ts apps/web/src/components/ui/avatar.tsx
git commit -m "feat(web): optimise avatar images with next/image"
```

---

### Task 12: Final Build Verification

**Step 1: Full build**

Run: `pnpm build` from repo root
Expected: clean build with no errors

**Step 2: Manual smoke test**

Run: `pnpm dev` from repo root

Verify:
- `http://localhost:3000/robots.txt` returns correct robots file
- `http://localhost:3000/sitemap.xml` returns sitemap with bug entries
- `http://localhost:3000/bugs/{some-id}` loads without authentication (open in incognito)
- View page source on a bug detail page — confirm `<title>`, OG tags, JSON-LD are present
- `http://localhost:3000/og/{some-id}` returns a PNG image
- Navigate to a non-existent page — 404 page shows improved design
- Homepage heading hierarchy is correct (inspect elements — no `<h3>` in value props)

**Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(web): address SEO smoke test issues"
```
