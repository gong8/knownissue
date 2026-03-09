# Issue Alignment Refactor — Design

## Problem

The product is called **knownissue** but every internal surface says "bug." The report schema requires library/version/ecosystem for every report, blocking non-library issues. Patch steps only support 4 rigid types. The credit economy penalizes contributions too harshly. The landing page describes mechanics instead of mission.

## Changes

### 1. Terminology: bug → issue

Rename across all layers: Prisma models, shared types/validators, API services, API routes, MCP tool descriptions, web dashboard routes and components, documentation.

**Database strategy:** Use `@@map("Bug")` and `@map` annotations to keep SQL table/column names unchanged. TypeScript names change, database stays stable. No destructive migration.

**Scope:**
- `Bug` → `Issue`, `BugStatus` → `IssueStatus`, `BugCategory` → `IssueCategory`, `BugAccuracy` → `IssueAccuracy`, `BugRelation` → `IssueRelation`, `BugRelationType` → `IssueRelationType`, `BugRevision` → `IssueRevision`
- `EntityType.bug` → `issue`, `CreditEventType.bug_reported` → `issue_reported`, `bug_reported_deferred` → `issue_reported_deferred`
- Routes: `/bugs/:id` → `/issues/:id`
- Functions: `searchBugs` → `searchIssues`, `createBug` → `createIssue`, etc.
- MCP tool titles/descriptions: "Report Bug" → "Report Issue", etc.

### 2. Schema Loosening

Make `library`, `version`, `ecosystem` optional on the Issue model and report input schema:
- `library String` → `library String?`
- `version String` → `version String?`
- `ecosystem String` → `ecosystem String?`

Minimum to report: `errorMessage` OR `description`. Nothing else required.

Expand `IssueCategory` enum with: `hallucination`, `deprecated`. Category stays optional.

### 3. Patch Flexibility

Add 5th patch step type: `instruction`

```typescript
const instructionStepSchema = z.object({
  type: z.literal("instruction"),
  text: z.string().min(1),
});
```

Covers knowledge corrections, pattern advice, "use X instead of Y" — everything the 4 rigid types can't express.

### 4. Credit Economy

- Search: stays at -1 (unchanged)
- Duplicate penalty: -5 → -2
- Duplicate warn threshold: 0.92 → 0.90
- Duplicate reject threshold: 0.98 → 0.96
- Tool descriptions: de-emphasize credit costs, lead with purpose

### 5. MCP Tool Descriptions

Rewrite all tool descriptions:
- "bug" → "issue"
- De-emphasize costs (mention at end, not lead)
- Lead with what the tool does and why

### 6. Landing Page Copy

- Hero: communicate network effect
- Philosophy: complete problem → solution → network
- Tools section: purpose over credits
- Final CTA: forward-looking vision

## Non-Changes

- Database table names stay as `Bug` (via `@@map`)
- Search cost stays at 1 credit
- Core verification loop unchanged
- MCP server instructions (already written, just update "bug" → "issue" references)
- Patch step types code_change/version_bump/config_change/command stay
