# Landing Page Redesign — "The Protocol"

## Problem

The current landing page has good copy but zero visual identity. Every component uses shadcn defaults (rounded-lg, bg-surface, border-border cards). The result looks like any dark-mode Tailwind starter. The terminal demo is strong but buried in generic styling.

## Direction

**Hacker/raw.** Linear meets a terminal. Monochrome with surgical accents. Sharp edges, monospace headers, protocol-spec density. The terminal demo IS the hero — visitors see the product working before reading a word.

**Alternating tension.** Sparse breathing sections (one sentence, massive whitespace) alternate with dense specification sections (tools table, config blocks).

## Page structure

### 1. Navbar
- Strip button styling from "sign in" — plain text link like "github"
- Two monospace text links on right: `github` · `sign in`
- Backdrop blur, no visible border

### 2. Hero (terminal-dominant)
- Muted small monospace label: `shared bug memory for ai coding agents.`
- Terminal demo fills container width
  - Kill traffic light dots — replace with `$ terminal` label or thin top border
  - `rounded-sm` not `rounded-lg`
  - Subtle atmospheric glow: `shadow-[0_0_40px_-10px] shadow-primary/10`
- Below terminal: single CTA — `connect your agent` button, minimal
- The big headline ("your agent hits a bug...") moves OUT of hero → becomes section 3

### 3. Philosophy (sparse — breathing room)
- `py-32` padding
- One sentence, centered, large monospace bold:
  > your agent hits a bug someone already fixed. but the fix died in their conversation.
- Nothing else. Whitespace is the design.

### 4. Tools Spec (dense)
- 2-column layout (same grid as current tools section)
- Left: heading "five tools. one loop." + description paragraph
- Right: monospace specification block showing all 5 tools with credit costs
  - Aligned columns: name, description, cost
  - Rendered as `<pre>` or monospace div, not a list
- Include credit economy inline — no separate explanation needed

### 5. Agents (sparse)
- One centered monospace line, muted:
  `claude-code · cursor · codex · gemini-cli · amp · droid · opencode · antigravity`
- Each clickable → scrolls to config
- Minimal section — just a trust signal

### 6. Config (dense)
- `bg-surface` background for section distinction
- Sharp tabs (underline indicator, not pill/rounded)
- Same 8 agent configs
- Code blocks with `rounded-sm`, matching terminal aesthetic
- Keep gradient animation on heading — the one moment of color
- "or sign in to explore the dashboard" link below

### 7. CTA (sparse)
- `py-32` padding
- Centered monospace bold: "fixes shouldn't die in conversations."
- One button: `connect your agent`. No secondary.

### 8. Footer
- One line. `[knownissue]` left, `github · © 2026` right.

## Global visual rules

- **Corners:** Kill all `rounded-lg`. Use `rounded-sm` or `rounded-none`.
- **Borders:** Hairline `border-border` only. No shadow-2xl, no double borders.
- **Color budget:** Monochrome base. Green (`text-green-400`) for success states in terminal. Purple (`primary`) only on CTA button + config heading gradient. Nothing else.
- **Typography:** Mono for all headings and labels. Sans for body/descriptions. Increase contrast between the two.
- **Glow:** Terminal gets subtle `shadow-[0_0_40px_-10px] shadow-primary/10`. Atmospheric, not decorative.
- **No cards.** No rounded card containers with `bg-surface p-6 border`. Information is presented through typography, spacing, and alignment.

## Files to modify

- `apps/web/src/app/page.tsx` — restructure sections, new rhythm
- `apps/web/src/components/landing/hero-section.tsx` — strip to label + CTA, move headline out
- `apps/web/src/components/landing/terminal-demo.tsx` — kill traffic lights, sharp corners, glow
- `apps/web/src/components/landing/navbar.tsx` — strip button, plain links
- `apps/web/src/components/landing/value-cards.tsx` — delete or repurpose as philosophy section
- `apps/web/src/components/landing/tools-section.tsx` — rewrite as spec table
- `apps/web/src/components/landing/agents-bar.tsx` — rewrite as single monospace line
- `apps/web/src/components/landing/config-tabs.tsx` — sharp tabs, sharp code blocks
- `apps/web/src/components/landing/code-block.tsx` — rounded-sm, match terminal
- `apps/web/src/components/landing/final-cta.tsx` — strip to one line + one button
- `apps/web/src/components/landing/footer-section.tsx` — compress to one line
- `apps/web/src/app/globals.css` — may need minor adjustments

## Non-goals

- No illustrations or SVG graphics
- No social proof / testimonials
- No live API stats
- No new npm dependencies
- No light mode
