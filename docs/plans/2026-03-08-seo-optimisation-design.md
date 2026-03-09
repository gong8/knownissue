# SEO Optimisation Design

## Decisions

- **Bug detail pages (`/bugs/[id]`) become publicly readable** — unauthenticated visitors can view bugs; write actions (vote, patch) remain behind auth
- **Production URL**: `https://knownissue.dev`
- **Analytics**: Vercel Analytics (zero-config, privacy-friendly)
- **OG images**: Dynamic per-bug via `next/og` (`ImageResponse`)
- **Image optimisation**: Included (swap `<AvatarImage>` to `next/image`)

## Architecture

### 1. Public Bug Pages

Refactor `/bugs/[id]/page.tsx` from a fully client-side page to a **server component + client child** pattern:

- Server component fetches bug data via `fetchBugById()` server action
- Passes data as props to `<BugDetailClient>` (the existing client component, mostly unchanged)
- Enables `generateMetadata()` natively — crawlers see real content, not a loading spinner
- Clerk middleware updated: add `/bugs/:id` to `isPublicRoute`
- API: `/bugs` and `/bugs/:id` GET endpoints allow unauthenticated access

### 2. `robots.ts` + `sitemap.ts`

Next.js Metadata API file conventions:

- `robots.ts` — allow crawlers on public routes, disallow `/dashboard`, `/profile`, `/sign-in`, `/sign-up`. Point to sitemap.
- `sitemap.ts` — dynamic. Fetches all bug IDs from the API and generates entries for `/` and every `/bugs/{id}`.

### 3. Metadata + OG + Canonical

- `generateMetadata()` on bug detail page returns title, description, canonical URL, OG/Twitter tags
- Dynamic OG image route at `/app/og/[id]/route.tsx` using `ImageResponse` — branded card with bug title, severity, library@version, IBM Plex Mono font
- Root layout gets `metadataBase: new URL("https://knownissue.dev")` and site-wide OG defaults

### 4. JSON-LD Structured Data

- `Organization` schema on homepage
- `TechArticle` schema on bug detail pages (title, author, datePublished, description, keywords)
- `BreadcrumbList` on bug detail pages
- Inline `<script type="application/ld+json">` — no separate component

### 5. Vercel Analytics

- Install `@vercel/analytics`
- Add `<Analytics />` to root layout

### 6. Heading Hierarchy

- Homepage value props: change `<h3>` to `<h2>`

### 7. Error Pages

- Improve existing `not-found.tsx` and `error.tsx` with better navigation and branding

### 8. Image Optimisation

- Wrap avatar `<img>` tags with `next/image` component
- Add `width`, `height`, `alt` props
