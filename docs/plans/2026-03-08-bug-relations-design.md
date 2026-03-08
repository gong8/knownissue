# Bug Relations Design

## Problem

Bugs exist in isolation. There's no way to see "Next.js 15->16 broke these 12 things", no edge between related bugs, no traversal. The data gets bigger but not smarter. Relationship tracking lets the system compound — agents find not just one bug but the cluster around it.

## Decisions

- **6 relationship types** covering real software development patterns
- **Dual creation**: agent-reported (explicit) + system-inferred (automatic)
- **Consumption**: inline in search/get_patch results, no new MCP tool
- **Credits**: free — no cost, no reward for linking

## Data Model

Two new enums, one new model.

### Enums

```prisma
enum BugRelationType {
  same_root_cause        // different symptoms, same underlying fix
  version_regression     // same bug reappears in newer version
  cascading_dependency   // fixing/upgrading A causes bug B
  interaction_conflict   // bug only appears when A + B used together
  shared_fix             // different bugs solved by same patch approach
  fix_conflict           // patch for A breaks patch for B
}

enum RelationSource {
  agent    // explicitly reported by an agent
  system   // auto-inferred by the system
}
```

### BugRelation Model

```prisma
model BugRelation {
  id          String          @id @default(uuid())
  type        BugRelationType
  source      RelationSource
  confidence  Float           @default(1.0)  // 1.0 for agent, 0.0-1.0 for system
  metadata    Json?           // { reason, sharedPatchId, inferenceMethod, ... }

  sourceBugId String
  sourceBug   Bug    @relation("RelationsFrom", fields: [sourceBugId], references: [id], onDelete: Cascade)

  targetBugId String
  targetBug   Bug    @relation("RelationsTo", fields: [targetBugId], references: [id], onDelete: Cascade)

  createdById String?
  createdBy   User?  @relation(fields: [createdById], references: [id], onDelete: SetNull)

  createdAt   DateTime @default(now())

  @@unique([sourceBugId, targetBugId, type])
  @@index([sourceBugId])
  @@index([targetBugId])
  @@index([type])
}
```

### Directionality Convention

- **Directional types** (cascading_dependency, version_regression): source is the cause/predecessor, target is the effect/successor.
- **Symmetric types** (same_root_cause, interaction_conflict, shared_fix, fix_conflict): source is the older bug (by `createdAt`).

### Bug Model Additions

```prisma
model Bug {
  // ... existing fields ...
  relationsFrom BugRelation[] @relation("RelationsFrom")
  relationsTo   BugRelation[] @relation("RelationsTo")
}
```

### User Model Addition

```prisma
model User {
  // ... existing fields ...
  bugRelations BugRelation[]
}
```

## Agent Reporting

No new MCP tool. Optional `relatedTo` field on existing `report` and `patch` tools.

### On `report` (all 6 types)

```typescript
relatedTo: z.object({
  bugId: z.uuid(),
  type: z.enum([
    "same_root_cause",
    "version_regression",
    "cascading_dependency",
    "interaction_conflict",
    "shared_fix",
    "fix_conflict",
  ]),
  note: z.string().optional(),
}).optional()
  .describe("Link this bug to an existing bug. Use when you encountered this bug while working on another.")
```

### On `patch` (shared_fix, fix_conflict only)

```typescript
relatedTo: z.object({
  bugId: z.uuid(),
  type: z.enum(["shared_fix", "fix_conflict"]),
  note: z.string().optional(),
}).optional()
  .describe("Link this patch's bug to another bug. Use 'shared_fix' if this patch also fixes the other bug, 'fix_conflict' if they can't coexist.")
```

### Behavior

- Creates `BugRelation` with `source: agent`, `confidence: 1.0`, `createdById: userId`.
- Unique constraint hit = silently skip (idempotent).
- No extra credit cost or reward.

## System Inference

A `RelationInferencer` service in `apps/api/src/services/relations.ts`. Runs as a post-hook after `createBug` and `submitPatch` — synchronous, not a background job.

### Inference Rules

| Type | Trigger | Logic | Confidence |
|---|---|---|---|
| same_root_cause | createBug | Embedding similarity > 0.85 with existing bug in same `library`, different `errorMessage`/`errorCode` | similarity score |
| version_regression | createBug | Same `library` + same `fingerprint` or `errorCode` + different `version` | 0.95 (fingerprint), 0.8 (errorCode) |
| cascading_dependency | createBug | New bug's `library` appears in existing bug's `contextLibraries` or vice versa, same reporter within 24h | 0.7 |
| interaction_conflict | createBug | Shares 2+ `contextLibraries` entries with existing bug, both category: compatibility or behavior | 0.6 |
| shared_fix | submitPatch | Patch targets same `filePath` or `package` as patch on a different bug | 0.7 (file), 0.8 (package+version) |
| fix_conflict | submitPatch | `version_bump` step for same package but different target version as existing patch on related bug | 0.9 |

### Guardrails

- Max 5 inferred relations per trigger.
- Only infer against bugs from the last 6 months.
- Discard relations with confidence < 0.5.
- Reuses embedding already generated during `createBug` — no extra OpenAI call.
- No confirmation flow. System-inferred relations exist with their confidence score. Consumers filter by threshold.

## Search Result Integration

Each bug in search results includes a `relatedBugs` array. No extra tool call.

### Response Shape

```typescript
{
  id: "...",
  title: "...",
  // ... existing fields ...
  patches: [...],
  relatedBugs: [
    {
      bugId: "abc-123",
      title: "TypeError in lodash.merge with circular refs",
      library: "lodash",
      version: "4.17.22",
      relationType: "same_root_cause",
      confidence: 0.91,
      source: "system",
      sharedPatchId?: "def-456",  // only for shared_fix
    }
  ]
}
```

### Query Strategy

Batch-load relations for all returned bugIds in a single query after loading search results:

```sql
SELECT br.*, b.id, b.title, b.library, b.version
FROM "BugRelation" br
JOIN "Bug" b ON b.id = CASE
  WHEN br."sourceBugId" = ANY($1) THEN br."targetBugId"
  ELSE br."sourceBugId"
END
WHERE (br."sourceBugId" = ANY($1) OR br."targetBugId" = ANY($1))
  AND br.confidence >= 0.7
ORDER BY br.confidence DESC
LIMIT 3  -- per bug, enforced in application code
```

### Limits

- Max 3 related bugs per search result.
- Only relations with confidence >= 0.7.
- `get_patch` also includes related bugs for the patch's parent bug, same limits.
- Related bugs included within `maxTokens` budget — truncated first when response is large.

## Credit Economy

No changes. Linking is free in both directions. Rationale: maximize linking with zero friction. Charging suppresses it, rewarding invites spam.

## Audit

Standard `AuditLog` entries for every `BugRelation` creation:

```typescript
{
  action: "create",
  entityType: "bug",
  entityId: sourceBugId,
  metadata: {
    relationType: "same_root_cause",
    targetBugId: "...",
    source: "agent" | "system",
    confidence: 0.91,
  }
}
```

No new `EntityType` enum value — the relation is an attribute of a bug.

## Research References

- [Breaking changes in NPM ecosystem](https://dl.acm.org/doi/10.1145/3702991) — 44% of breaking changes ship in minor/patch releases, causing same-root-cause clusters.
- [Manifesting breaking changes in client packages](https://dl.acm.org/doi/10.1145/3576037) — ~12% of packages impacted by dependency breaking changes (cascading_dependency pattern).
- [ConflictJS](https://blog.acolyer.org/2018/06/20/conflictjs-finding-and-understanding-conflicts-between-javascript-libraries/) — 1 in 4 JS libraries has conflicts with another (interaction_conflict pattern).
- [Bug knowledge graphs](https://www.semanticscholar.org/paper/Constructing-Bug-Knowledge-Graph-as-a-Service-for-Chen/08e78156851532f06e2e061689b05012aa6f2343) — linking bugs to commits and packages via extracted relationships.
- [Sentry AI grouping](https://blog.sentry.io/ai-powered-updates-issue-grouping-autofix-anomaly-detection-and-more/) — semantic fingerprints reduce noise ~40% (inspiration for system inference).
- [CWE root cause mapping](https://cwe.mitre.org/documents/cwe_usage/guidance.html) — hierarchical taxonomy mapping symptoms to root causes.
