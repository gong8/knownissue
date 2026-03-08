# Landing Page Rebuild Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the landing page layout from narrow/bordered to wide/spacious, matching Linear's spatial confidence while keeping existing content.

**Architecture:** Widen all containers from `max-w-2xl` to `max-w-6xl`, remove `border-t` separators, unify hero + terminal as one section, add agents bar + value cards + final CTA as new components. All client components use `"use client"` directive. No new dependencies.

**Tech Stack:** Next.js App Router, Tailwind CSS v4, React, existing shadcn Button/Tabs components, Lucide icons.

---

### Task 1: Create new components (agents-bar, value-cards, final-cta)

**Files:**
- Create: `apps/web/src/components/landing/agents-bar.tsx`
- Create: `apps/web/src/components/landing/value-cards.tsx`
- Create: `apps/web/src/components/landing/final-cta.tsx`

**Step 1: Create agents-bar.tsx**

```tsx
// apps/web/src/components/landing/agents-bar.tsx
"use client";

const agents = [
  "Claude Code",
  "Cursor",
  "Codex",
  "Gemini CLI",
  "Amp",
  "Droid",
  "OpenCode",
  "Antigravity",
];

export function AgentsBar() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
      {agents.map((agent) => (
        <button
          key={agent}
          onClick={() =>
            document
              .getElementById("config")
              ?.scrollIntoView({ behavior: "smooth" })
          }
          className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
        >
          {agent}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Create value-cards.tsx**

```tsx
// apps/web/src/components/landing/value-cards.tsx
const cards = [
  {
    label: "0.1",
    title: "find",
    desc: "agents search by library, version, and semantic similarity to find bugs others already hit.",
  },
  {
    label: "0.2",
    title: "fix",
    desc: "agents share patches and retrieve verified fixes from the shared memory.",
  },
  {
    label: "0.3",
    title: "prove",
    desc: "agents verify whether patches actually work, building trust through empirical evidence.",
  },
];

export function ValueCards() {
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.title}
          className="rounded-lg bg-surface p-6 border border-border"
        >
          <span className="font-mono text-xs text-muted-foreground">
            {card.label}
          </span>
          <h3 className="mt-3 font-mono text-lg font-semibold text-foreground">
            {card.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {card.desc}
          </p>
        </div>
      ))}
    </div>
  );
}
```

**Step 3: Create final-cta.tsx**

```tsx
// apps/web/src/components/landing/final-cta.tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function FinalCta() {
  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="max-w-xl font-mono text-2xl font-bold tracking-tight sm:text-3xl">
        fixes shouldn&apos;t die in conversations.
      </h2>
      <div className="mt-8 flex items-center gap-4">
        <Button
          size="lg"
          className="font-mono"
          onClick={() =>
            document
              .getElementById("config")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          connect your agent
        </Button>
        <Button size="lg" variant="outline" className="font-mono" asChild>
          <Link href="/sign-in">explore the dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
```

**Step 4: Verify files exist**

Run: `ls apps/web/src/components/landing/{agents-bar,value-cards,final-cta}.tsx`
Expected: all 3 files listed

**Step 5: Commit**

```bash
git add apps/web/src/components/landing/agents-bar.tsx apps/web/src/components/landing/value-cards.tsx apps/web/src/components/landing/final-cta.tsx
git commit -m "feat(landing): add agents-bar, value-cards, final-cta components"
```

---

### Task 2: Rebuild hero-section with dual CTA, no eyebrow

**Files:**
- Modify: `apps/web/src/components/landing/hero-section.tsx`

**Step 1: Rewrite hero-section.tsx**

Replace entire file with:

```tsx
// apps/web/src/components/landing/hero-section.tsx
"use client";

import { Button } from "@/components/ui/button";

export function HeroSection() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="animate-fade-up flex flex-col items-center text-center">
      <h1 className="max-w-3xl font-mono text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
        your agent hits a bug someone already fixed. but the fix died in their
        conversation.
      </h1>

      <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">
        [knownissue] is where fixes survive. one mcp connection gives your agent
        access to every bug report, patch, and verification from every other
        agent.
      </p>

      <div className="mt-8 flex items-center gap-4">
        <Button
          size="lg"
          className="font-mono"
          onClick={() => scrollTo("config")}
        >
          connect your agent
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="font-mono"
          onClick={() => scrollTo("tools")}
        >
          see how it works
        </Button>
      </div>
    </div>
  );
}
```

Key changes: removed eyebrow, widened h1 from `max-w-2xl` to `max-w-3xl`, tightened payoff line, added secondary ghost button.

**Step 2: Commit**

```bash
git add apps/web/src/components/landing/hero-section.tsx
git commit -m "feat(landing): rebuild hero with dual CTA, remove eyebrow"
```

---

### Task 3: Widen terminal-demo

**Files:**
- Modify: `apps/web/src/components/landing/terminal-demo.tsx`

**Step 1: Widen the container**

In `apps/web/src/components/landing/terminal-demo.tsx`, change the outer div className:

From: `"mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-background shadow-2xl shadow-primary/5"`

To: `"mx-auto w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-background shadow-2xl shadow-primary/5"`

That's the only change — `max-w-2xl` to `max-w-4xl`.

**Step 2: Commit**

```bash
git add apps/web/src/components/landing/terminal-demo.tsx
git commit -m "feat(landing): widen terminal demo to max-w-4xl"
```

---

### Task 4: Rewrite tools-section as 2-column layout

**Files:**
- Modify: `apps/web/src/components/landing/tools-section.tsx`

**Step 1: Rewrite tools-section.tsx**

Replace entire file with:

```tsx
// apps/web/src/components/landing/tools-section.tsx
const tools = [
  { name: "search", desc: "find bugs by library, version, and semantic similarity" },
  { name: "report", desc: "submit a new bug with full context" },
  { name: "patch", desc: "share a fix that worked" },
  { name: "get_patch", desc: "retrieve a verified patch" },
  { name: "verify", desc: "confirm whether a patch actually fixed it" },
];

export function ToolsSection() {
  return (
    <section id="tools" className="px-6 py-24">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <h2 className="font-mono text-2xl font-bold tracking-tight sm:text-3xl">
            five tools. one loop.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            agents search for known bugs, report new ones, share patches,
            retrieve fixes, and verify whether they actually work. every
            contribution earns credits. every search costs one.
          </p>
        </div>

        <div className="lg:col-span-3">
          <div className="divide-y divide-border">
            {tools.map((tool) => (
              <div key={tool.name} className="flex gap-6 py-4 first:pt-0 last:pb-0">
                <span className="w-28 shrink-0 font-mono text-sm font-medium text-primary">
                  {tool.name}
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground">
                  {tool.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/landing/tools-section.tsx
git commit -m "feat(landing): rewrite tools section as 2-column layout"
```

---

### Task 5: Widen config-tabs and footer

**Files:**
- Modify: `apps/web/src/components/landing/config-tabs.tsx`
- Modify: `apps/web/src/components/landing/footer-section.tsx`

**Step 1: Widen config-tabs container**

In `apps/web/src/components/landing/config-tabs.tsx`:

Change outer section from:
`<section id="config" className="border-t border-border px-6 py-20">`
To:
`<section id="config" className="bg-surface px-6 py-24">`

Change inner div from:
`<div className="mx-auto w-full max-w-2xl text-center">`
To:
`<div className="mx-auto w-full max-w-4xl text-center">`

**Step 2: Widen footer container**

In `apps/web/src/components/landing/footer-section.tsx`:

Change from:
`<footer className="border-t border-border px-6 py-10">`
To:
`<footer className="px-6 py-10">`

Change from:
`<div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 sm:flex-row">`
To:
`<div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">`

**Step 3: Commit**

```bash
git add apps/web/src/components/landing/config-tabs.tsx apps/web/src/components/landing/footer-section.tsx
git commit -m "feat(landing): widen config tabs and footer, remove borders"
```

---

### Task 6: Widen navbar

**Files:**
- Modify: `apps/web/src/components/landing/navbar.tsx`

**Step 1: Widen navbar container**

Change inner div from:
`<div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">`
To:
`<div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">`

Remove bottom border — change from:
`<nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">`
To:
`<nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl">`

**Step 2: Commit**

```bash
git add apps/web/src/components/landing/navbar.tsx
git commit -m "feat(landing): widen navbar, remove bottom border"
```

---

### Task 7: Assemble page.tsx with new structure

**Files:**
- Modify: `apps/web/src/app/page.tsx`

**Step 1: Rewrite page.tsx**

Replace entire file. The new structure:
1. Navbar
2. Hero + Terminal Demo (one section, no border)
3. Agents Bar
4. Statement + Value Cards
5. Tools Detail (2-column)
6. Config Tabs (bg-surface)
7. Final CTA (py-32)
8. Footer
9. Structured data script (existing pattern, hardcoded JSON — safe usage, no user input)

See design doc for exact section layout. Key points:
- No `border-t` wrappers anywhere
- Hero and terminal in one `<section>` with `pt-24 pb-16`
- Statement as inline h2 (too small for its own component)
- All sections use `max-w-6xl` containers
- Final CTA gets `py-32` for generous spacing

**Step 2: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(landing): assemble new page structure with all sections"
```

---

### Task 8: Visual check and polish

**Step 1: Run dev server**

Run: `pnpm dev` from repo root

**Step 2: Visual check in browser**

Visit `http://localhost:3000` and verify:
- Navbar: full width, no bottom border
- Hero: centered, no eyebrow, dual CTAs
- Terminal: flows below hero without border, wider
- Agents bar: 8 names horizontally
- Statement + 3 value cards in grid
- Tools: 2-column (heading left, tools right)
- Config tabs: bg-surface background, wider
- Final CTA: generous padding
- Footer: wider, no top border
- No section borders visible
- Responsive on mobile

**Step 3: Fix any spacing issues found**

**Step 4: Commit polish**

```bash
git add -u
git commit -m "fix(landing): polish spacing and alignment"
```
