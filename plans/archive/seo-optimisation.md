# SEO Optimisation Plan

## Current State: Bare Minimum

Running **Next.js 16 with App Router** — solid foundation for SEO, but barely utilised.

### What's Working

- **Root metadata** in `layout.tsx` — title and description are set
- **HTML lang="en"** is present
- **Font optimisation** — Google Fonts loaded via `next/font` (good for Core Web Vitals)
- **Internal linking** — proper use of Next.js `Link` components
- **Server-side rendering** — App Router gives SSR by default

### Critical Gaps

| Missing | Impact |
|---------|--------|
| **No `robots.txt`** | Search engines have no crawl guidance |
| **No `sitemap.xml`** | Crawlers can't discover bug pages |
| **No Open Graph / Twitter Cards** | Links shared on social media look bare |
| **No page-specific metadata** | Bug detail pages (`/bugs/[id]`) all share the same generic title/description |
| **No canonical URLs** | Risk of duplicate content issues |
| **No structured data (JSON-LD)** | No rich results in search (no Article schema for bugs, no Organisation schema) |
| **No analytics** | No visibility into traffic or Core Web Vitals |

### Other Issues

- **No custom 404/error pages** — missed opportunity to retain visitors
- **No `next/image`** — using raw `<img>` via Radix Avatar, missing optimisation
- **Heading hierarchy problems** — `<h3>` tags on the homepage without preceding `<h2>`
- **Most content is behind auth** — only the landing page (`/`) is publicly crawlable, which severely limits what search engines can index

### The Big Picture

Only the homepage is publicly accessible — everything else requires Clerk sign-in. If bug pages should be discoverable (which makes sense for "Stack Overflow for AI Agents"), at least the bug detail pages need to be publicly readable.

---

## Priority Improvements

### 1. `robots.txt` + `sitemap.ts` (Critical)

Table stakes for any site.

- Create `/apps/web/src/app/robots.ts` using Next.js Metadata API
- Create `/apps/web/src/app/sitemap.ts` with dynamic bug page entries
- Allow crawling of public pages, disallow auth/dashboard routes

### 2. `generateMetadata()` on `/bugs/[id]` (Critical)

Dynamic titles and descriptions per bug page.

- Implement `generateMetadata()` in `/apps/web/src/app/(dashboard)/bugs/[id]/page.tsx`
- Pull bug title, description, and tags into meta tags
- Set canonical URL for each bug page

### 3. Open Graph & Twitter Card Tags (Critical)

So shared links look good on social media.

- Add OG tags to root layout metadata (og:site_name, og:type, og:locale)
- Add page-specific OG tags via `generateMetadata()` on bug detail pages
- Include og:title, og:description, og:image, og:url
- Add Twitter Card tags (twitter:card, twitter:title, twitter:description)

### 4. Make Bug Pages Public (High — Product Decision)

If the product vision is "Stack Overflow for AI Agents", bug pages should be publicly readable.

- Update Clerk middleware to allow unauthenticated access to `/bugs/[id]`
- Keep write actions (commenting, patching) behind auth
- This is the single biggest SEO lever — without it, there's almost nothing to index

### 5. JSON-LD Structured Data (High)

Enable rich results in search.

- Add `Organization` schema on the homepage
- Add `Article` schema on bug detail pages (title, author, datePublished, description)
- Add `BreadcrumbList` schema for navigation paths
- Implement as a reusable `<JsonLd>` component

### 6. Analytics (High)

- Set up Google Analytics 4 or Vercel Analytics
- Track Core Web Vitals
- Track key conversions (bug reports, patches submitted)

### 7. Custom Error Pages (Medium)

- Create `/apps/web/src/app/not-found.tsx` with helpful navigation
- Create `/apps/web/src/app/error.tsx` with recovery options

### 8. Image Optimisation (Medium)

- Switch from Radix `AvatarImage` raw `<img>` to `next/image` where possible
- Ensure all images have meaningful `alt` attributes

### 9. Fix Heading Hierarchy (Medium)

- Homepage: change `<h3>` tags in features section to `<h2>` or add a parent `<h2>`
- Ensure every page has exactly one `<h1>` and a logical heading progression

### 10. Canonical URLs (Medium)

- Add `alternates.canonical` to metadata on all pages
- Especially important for dynamic routes to prevent duplicate content

---

## Implementation Order

1. `robots.txt` + `sitemap.ts`
2. `generateMetadata()` on bug pages
3. Open Graph + Twitter Cards
4. Make bug pages public (requires product decision)
5. JSON-LD structured data
6. Analytics setup
7. Custom error pages
8. Image optimisation
9. Heading hierarchy fixes
10. Canonical URLs
