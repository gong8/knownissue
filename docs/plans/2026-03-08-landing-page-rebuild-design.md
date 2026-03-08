# Landing Page Rebuild — Design

## Problem

Current landing page uses `max-w-2xl` (672px) everywhere, `border-t` between every section, single-column centered layout, no visual weight. Feels like a styled README, not a product page.

## Goal

Rebuild the layout to match the spatial confidence of Linear/Runlayer — wide containers, generous spacing, visual hierarchy through scale and background shifts rather than borders. Keep existing content and copy (it's good), fix the bones.

## Design

### Layout system

- Container: `max-w-6xl` (1152px) for all sections
- No `border-t` between sections — spacing creates separation
- Section padding: `py-24` minimum (currently `py-20`)
- Subtle background variation between sections using `bg-background` / `bg-surface` alternation

### Section 1: Navbar

Sticky, full-width. `max-w-6xl` inner container.

- Left: `[knownissue]` mono brand
- Right: `github` link + `sign in` button
- Same as current, just wider container

### Section 2: Hero + Terminal Demo (unified)

No border between hero text and terminal demo. They are one visual unit.

**Hero text (centered):**
- Kill the eyebrow ("the social network for agentic debugging") — replace with nothing or a simple `mcp server` label
- h1: keep exactly as-is — "your agent hits a bug someone already fixed. but the fix died in their conversation."
- Payoff: tighten to something more concrete
- Dual CTA: primary solid button "connect your agent" + ghost/outline "see how it works" (scrolls to tools section)

**Terminal demo (directly below, no border):**
- Expand to full container width (`max-w-4xl` or `max-w-5xl` — wider than current `max-w-2xl`)
- Remove the section wrapper with `border-t` — it flows directly from hero text
- Keep the animated typing, intersection observer trigger, traffic light dots

### Section 3: Supported Agents Bar

Horizontal row of agent names/icons. Static, not scrolling (only 8 items).

Content: Claude Code, Cursor, Codex, Gemini CLI, Amp, Droid, OpenCode, Antigravity

Clicking an agent scrolls to the config tabs section. Styled as muted text or small pill badges — not flashy, just a trust signal that says "we support your tool."

### Section 4: Statement + Value Cards

**Statement:** Bold centered text, larger font. Something like:
> **one mcp connection. five tools.** every fix your agent shares makes every other agent smarter.

(Adapted from existing copy in the tools section.)

**3 cards in a grid (`grid-cols-3`):**

1. **find** — agents search by library, version, and semantic similarity to find bugs others already hit
2. **fix** — agents share patches and retrieve verified fixes from the shared memory
3. **prove** — agents verify whether patches actually work, building trust through empirical evidence

Each card: mono label at top, title, one sentence description. Styled on `bg-surface` with subtle border. Think Linear's FIG 0.2/0.3/0.4 pattern.

### Section 5: Tools Detail (2-column)

Left column (~40%):
- Heading: "five tools. one loop."
- Description paragraph explaining the cycle: search → report → patch → get_patch → verify
- The credit economy hint: "every contribution earns credits. every search costs one."

Right column (~60%):
- The 5 tools listed with more visual weight than current `<ul>`
- Each tool as a row: mono tool name (prominent, primary color) + description
- Maybe subtle separator lines between tools
- More padding, larger text than current

### Section 6: Config Tabs (wide)

- `bg-surface` background to distinguish from surrounding sections
- Heading: "connect your agent in 30 seconds." (keep gradient animation)
- Subtitle: "add [knownissue] to your coding agent's mcp config. one line. done."
- Tabs wider, more breathing room
- Keep all 8 agent configs
- "or sign in to explore the dashboard" link below

### Section 7: Final CTA

Centered, generous padding (`py-32`).

- Bold heading: "fixes shouldn't die in conversations."
- Dual CTA: "connect your agent" + "explore the dashboard"
- Clean, minimal — like Linear's "Built for the future. Available today."

### Section 8: Footer

Same content as current, wider container (`max-w-6xl`). Brand left, links + copyright right.

## Files to modify

- `apps/web/src/app/page.tsx` — restructure section layout, remove border-t wrappers
- `apps/web/src/components/landing/hero-section.tsx` — remove eyebrow, add dual CTA
- `apps/web/src/components/landing/terminal-demo.tsx` — widen, remove outer border section
- `apps/web/src/components/landing/tools-section.tsx` — rewrite as 2-column layout
- `apps/web/src/components/landing/config-tabs.tsx` — widen container
- `apps/web/src/components/landing/footer-section.tsx` — widen container
- `apps/web/src/app/globals.css` — may need new animation or utility classes

## Files to create

- `apps/web/src/components/landing/agents-bar.tsx` — supported agents horizontal bar
- `apps/web/src/components/landing/value-cards.tsx` — 3-column value proposition cards
- `apps/web/src/components/landing/final-cta.tsx` — bottom CTA section

## Files to delete

- None. All deleted files in git status are already gone (previous cleanup).

## Non-goals

- No new animations beyond what exists
- No social proof / testimonials (don't have real ones yet)
- No live stats from API (future enhancement)
- No dark/light section alternation like Runlayer — stay dark throughout like Linear
- No 3D illustrations or heavy visuals
