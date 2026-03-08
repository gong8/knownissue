import { z } from "zod";
import { MIN_TITLE_LENGTH, MIN_DESCRIPTION_LENGTH, MIN_EXPLANATION_LENGTH } from "./constants";

export const severitySchema = z.enum(["low", "medium", "high", "critical"])
  .describe("Bug severity: low, medium, high, or critical");
export const bugStatusSchema = z.enum(["open", "confirmed", "patched", "closed"]);
export const verificationOutcomeSchema = z.enum(["fixed", "not_fixed", "partial"])
  .describe("Verification outcome: 'fixed' if the patch resolved the issue, 'not_fixed' if it didn't, 'partial' if partially resolved");
export const bugAccuracySchema = z.enum(["accurate", "inaccurate"])
  .describe("Whether the bug report itself is accurate");
export const bugCategorySchema = z.enum(["crash", "build", "types", "performance", "behavior", "config", "compatibility", "install"])
  .describe("Bug category: crash, build, types, performance, behavior, config, compatibility, or install");

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

// ── 5 MCP Tool Schemas ────────────────────────────────────────────────────

export const searchInputSchema = z.object({
  query: z.string().min(1, "Search query is required")
    .describe("Natural language search query, error message, or error code. e.g. 'lodash.merge crashes on circular refs'"),
  library: z.string().optional()
    .describe("Filter to a specific package, e.g. 'react'"),
  version: z.string().optional()
    .describe("Filter to a specific version, e.g. '18.2.0'"),
  errorCode: z.string().optional()
    .describe("Exact error code to match, e.g. 'ERR_MODULE_NOT_FOUND', 'E0001'"),
  contextLibrary: z.string().optional()
    .describe("Filter by a library in the bug's context stack, e.g. 'webpack' to find bugs involving webpack"),
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
  context: z.array(z.object({
    name: z.string(),
    version: z.string(),
    role: z.string().optional(),
  })).optional()
    .describe("Other packages involved in the bug context, e.g. [{ name: 'webpack', version: '5.0.0', role: 'bundler' }]"),
  runtime: z.string().optional()
    .describe("Runtime environment, e.g. 'node 20.11.0', 'bun 1.0.0', 'python 3.12'"),
  platform: z.string().optional()
    .describe("Operating system/platform, e.g. 'macos-arm64', 'linux-x64', 'windows'"),
  category: bugCategorySchema.optional(),
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

export const getPatchInputSchema = z.object({
  patchId: z.uuid({ message: "Invalid patch ID" })
    .describe("UUID of the patch to retrieve. Use search to find bugs, then pick a patch ID from the results."),
});

export const verificationInputSchema = z.object({
  patchId: z.uuid({ message: "Invalid patch ID" })
    .describe("UUID of the patch being verified"),
  outcome: verificationOutcomeSchema,
  note: z.string().nullable().default(null)
    .describe("Optional note explaining the verification result"),
  errorBefore: z.string().optional()
    .describe("The error message before applying the patch"),
  errorAfter: z.string().optional()
    .describe("The error message after applying the patch (if still failing)"),
  testedVersion: z.string().optional()
    .describe("Version of the library you tested on, e.g. '4.17.21'"),
  bugAccuracy: bugAccuracySchema.optional()
    .describe("Whether the bug report itself was accurate"),
});

export const myActivityInputSchema = z.object({
  type: z.enum(["bugs", "patches", "verifications"]).optional()
    .describe("Filter to a specific activity type. Omit to see all."),
  outcome: z.enum(["fixed", "not_fixed", "partial"]).optional()
    .describe("Filter patches by verification outcome they received"),
  limit: z.number().int().min(1).max(50).optional()
    .describe("Max recent items per category (default 10)"),
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
  category: bugCategorySchema.optional(),
  runtime: z.string().optional(),
  platform: z.string().optional(),
});

// ── Inferred Types ────────────────────────────────────────────────────────

export type SearchInput = z.infer<typeof searchInputSchema>;
export type ReportInput = z.infer<typeof reportInputSchema>;
export type PatchInput = z.infer<typeof patchInputSchema>;
export type GetPatchInput = z.infer<typeof getPatchInputSchema>;
export type VerificationInput = z.infer<typeof verificationInputSchema>;
export type MyActivityInput = z.infer<typeof myActivityInputSchema>;
export type BugUpdate = z.infer<typeof bugUpdateSchema>;
export type PatchStepInput = z.infer<typeof patchStepSchema>;
