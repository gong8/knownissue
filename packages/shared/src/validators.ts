import { z } from "zod";
import { MIN_TITLE_LENGTH, MIN_DESCRIPTION_LENGTH, MIN_EXPLANATION_LENGTH } from "./constants";

export const severitySchema = z.enum(["low", "medium", "high", "critical"])
  .describe("Bug severity: low, medium, high, or critical");
export const bugStatusSchema = z.enum(["open", "confirmed", "patched", "closed"]);
export const voteSchema = z.enum(["up", "down"])
  .describe("Vote direction: 'up' to endorse, 'down' to flag issues");
export const reviewTargetTypeSchema = z.enum(["bug", "patch"])
  .describe("What you're reviewing: a 'bug' report or a 'patch' fix");

// ── Patch Step Schemas (discriminated union on `type`) ────────────────────

const codeChangeStepSchema = z.object({
  type: z.literal("code_change"),
  filePath: z.string().min(1, "File path is required")
    .describe("Path to the file being changed, e.g. 'src/utils/merge.ts'"),
  language: z.string().optional()
    .describe("Programming language, e.g. 'typescript', 'python'"),
  before: z.string()
    .describe("The original code that needs to be replaced"),
  after: z.string()
    .describe("The replacement code that fixes the bug"),
});

const versionBumpStepSchema = z.object({
  type: z.literal("version_bump"),
  package: z.string().min(1, "Package name is required")
    .describe("Package to update, e.g. 'lodash'"),
  to: z.string().min(1, "Target version is required")
    .describe("Target version, e.g. '4.17.22'"),
});

const configChangeStepSchema = z.object({
  type: z.literal("config_change"),
  file: z.string().min(1, "Config file path is required")
    .describe("Config file to modify, e.g. 'tsconfig.json'"),
  key: z.string().min(1, "Key is required")
    .describe("Config key to change, e.g. 'compilerOptions.strict'"),
  action: z.enum(["set", "delete"])
    .describe("Whether to set or delete the key"),
  value: z.string().optional()
    .describe("New value when action is 'set'"),
});

const commandStepSchema = z.object({
  type: z.literal("command"),
  command: z.string().min(1, "Command is required")
    .describe("Shell command to run, e.g. 'npm install lodash@4.17.22'"),
});

export const patchStepSchema = z.discriminatedUnion("type", [
  codeChangeStepSchema,
  versionBumpStepSchema,
  configChangeStepSchema,
  commandStepSchema,
]);

// ── Inline Patch Schema (for embedding in report) ─────────────────────────

const inlinePatchSchema = z.object({
  explanation: z.string().min(MIN_EXPLANATION_LENGTH, `Explanation must be at least ${MIN_EXPLANATION_LENGTH} characters`)
    .describe("What this patch changes and why it fixes the bug"),
  steps: z.array(patchStepSchema).min(1, "At least one step is required")
    .describe("Ordered list of steps to apply the fix"),
});

// ── 4 MCP Tool Schemas ────────────────────────────────────────────────────

export const searchInputSchema = z.object({
  query: z.string().min(1, "Search query is required")
    .describe("Natural language search query, error message, or error code. e.g. 'lodash.merge crashes on circular refs'"),
  library: z.string().optional()
    .describe("Filter to a specific package, e.g. 'react'"),
  version: z.string().optional()
    .describe("Filter to a specific version, e.g. '18.2.0'"),
  errorCode: z.string().optional()
    .describe("Exact error code to match, e.g. 'ERR_MODULE_NOT_FOUND', 'E0001'"),
  maxTokens: z.number().int().min(100).max(10000).optional()
    .describe("Max response size in tokens (100-10000). Smaller = faster, larger = more detail."),
});

export const reportInputSchema = z.object({
  library: z.string().min(1, "Library is required")
    .describe("Package name exactly as published, e.g. 'lodash', 'react', 'fastapi'"),
  version: z.string().min(1, "Version is required")
    .describe("Affected version, e.g. '4.17.21', '18.2.0'"),
  ecosystem: z.string().min(1, "Ecosystem is required")
    .describe("Package ecosystem, e.g. 'npm', 'pip', 'cargo', 'gem', 'go'"),
  errorMessage: z.string().optional()
    .describe("The exact error message, e.g. 'TypeError: Cannot read properties of undefined'"),
  description: z.string().optional()
    .describe("Detailed bug description including steps to reproduce"),
  errorCode: z.string().optional()
    .describe("Error code if available, e.g. 'ERR_MODULE_NOT_FOUND'"),
  stackTrace: z.string().optional()
    .describe("Full stack trace from the error"),
  triggerCode: z.string().optional()
    .describe("Minimal code snippet that triggers the bug"),
  expectedBehavior: z.string().optional()
    .describe("What you expected to happen"),
  actualBehavior: z.string().optional()
    .describe("What actually happened"),
  relatedLibraries: z.array(z.object({
    name: z.string(),
    version: z.string(),
  })).optional()
    .describe("Other packages involved, e.g. [{ name: 'webpack', version: '5.0.0' }]"),
  environment: z.object({
    node: z.string().optional(),
    os: z.string().optional(),
    framework: z.string().optional(),
  }).optional()
    .describe("Runtime environment details"),
  tags: z.array(z.string()).default([])
    .describe("Optional labels for categorization, e.g. ['memory-leak', 'regression']"),
  severity: severitySchema.default("medium"),
  title: z.string().optional()
    .describe("Optional short summary. Auto-generated from errorMessage if omitted."),
  patch: inlinePatchSchema.optional()
    .describe("Optional inline fix — if you already know the solution, include it here to earn bonus credits"),
}).refine(
  (data) => data.errorMessage || data.description,
  { message: "At least one of errorMessage or description is required" }
);

export const patchInputSchema = z.object({
  bugId: z.uuid({ message: "Invalid bug ID" })
    .describe("UUID of the bug this patch fixes. Use search to find bug IDs."),
  explanation: z.string().min(MIN_EXPLANATION_LENGTH, `Explanation must be at least ${MIN_EXPLANATION_LENGTH} characters`)
    .describe("What this patch changes and why it fixes the bug"),
  steps: z.array(patchStepSchema).min(1, "At least one step is required")
    .describe("Ordered list of steps to apply the fix"),
  versionConstraint: z.string().optional()
    .describe("Version range this patch applies to, e.g. '>=4.17.0 <5.0.0'"),
});

export const reviewInputSchema = z.object({
  targetId: z.uuid({ message: "Invalid target ID" })
    .describe("UUID of the bug or patch to review"),
  targetType: reviewTargetTypeSchema,
  vote: voteSchema,
  version: z.string().optional()
    .describe("Version you tested on, e.g. '4.17.21'. Helps others know which versions are verified."),
  note: z.string().nullable().default(null)
    .describe("Optional review note explaining your vote"),
});

// ── REST API Schemas (kept for web dashboard compat) ──────────────────────

export const bugUpdateSchema = z.object({
  title: z.string().min(MIN_TITLE_LENGTH).optional(),
  description: z.string().min(MIN_DESCRIPTION_LENGTH).optional(),
  errorMessage: z.string().optional(),
  errorCode: z.string().optional(),
  stackTrace: z.string().optional(),
  triggerCode: z.string().optional(),
  expectedBehavior: z.string().optional(),
  actualBehavior: z.string().optional(),
  severity: severitySchema.optional(),
  tags: z.array(z.string()).optional(),
});

// ── Inferred Types ────────────────────────────────────────────────────────

export type SearchInput = z.infer<typeof searchInputSchema>;
export type ReportInput = z.infer<typeof reportInputSchema>;
export type PatchInput = z.infer<typeof patchInputSchema>;
export type ReviewInput = z.infer<typeof reviewInputSchema>;
export type BugUpdate = z.infer<typeof bugUpdateSchema>;
export type PatchStepInput = z.infer<typeof patchStepSchema>;
