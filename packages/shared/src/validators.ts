import { z } from "zod";
import { MIN_TITLE_LENGTH, MIN_DESCRIPTION_LENGTH, MIN_EXPLANATION_LENGTH } from "./constants";

export const severitySchema = z.enum(["low", "medium", "high", "critical"])
  .describe("Issue severity: low, medium, high, or critical");
export const issueStatusSchema = z.enum(["open", "confirmed", "patched", "closed"]);
export const verificationOutcomeSchema = z.enum(["fixed", "not_fixed", "partial"])
  .describe("Verification outcome: 'fixed' if the patch resolved the issue, 'not_fixed' if it didn't, 'partial' if partially resolved");
export const issueAccuracySchema = z.enum(["accurate", "inaccurate"])
  .describe("Whether the issue report itself is accurate");
export const issueCategorySchema = z.enum(["crash", "build", "types", "performance", "behavior", "config", "compatibility", "install", "hallucination", "deprecated"])
  .describe("Issue category: crash, build, types, performance, behavior, config, compatibility, install, hallucination, or deprecated");

export const issueRelationTypeSchema = z.enum([
  "same_root_cause",
  "version_regression",
  "cascading_dependency",
  "interaction_conflict",
  "shared_fix",
  "fix_conflict",
]).describe("Type of relationship between two issues");

export const patchRelationTypeSchema = z.enum(["shared_fix", "fix_conflict"])
  .describe("Relation types available when submitting a patch");

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
    .describe("The replacement code that fixes the issue"),
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

const instructionStepSchema = z.object({
  type: z.literal("instruction"),
  text: z.string().min(1, "Instruction text is required")
    .describe("Plain text instruction, e.g. 'Use useEffect instead of useServerEffect'"),
});

export const patchStepSchema = z.discriminatedUnion("type", [
  codeChangeStepSchema,
  versionBumpStepSchema,
  configChangeStepSchema,
  commandStepSchema,
  instructionStepSchema,
]);

// ── Inline Patch Schema (for embedding in report) ─────────────────────────

const inlinePatchSchema = z.object({
  explanation: z.string().min(MIN_EXPLANATION_LENGTH, `Explanation must be at least ${MIN_EXPLANATION_LENGTH} characters`)
    .describe("What this patch changes and why it fixes the issue"),
  steps: z.array(patchStepSchema).min(1, "At least one step is required")
    .describe("Ordered list of steps to apply the fix"),
  versionConstraint: z.string().optional()
    .describe("Version range this patch applies to, e.g. '>=4.17.0 <5.0.0'"),
});

// ── 5 MCP Tool Schemas ────────────────────────────────────────────────────

export const searchInputBase = z.object({
  query: z.string().min(1).optional()
    .describe("Natural language search query, error message, or error code. e.g. 'lodash.merge crashes on circular refs'. Required unless patchId is provided."),
  patchId: z.uuid().optional()
    .describe("Look up a specific patch by ID. Free, no credit cost. Returns full patch details, verification history, and related issues."),
  library: z.string().optional()
    .describe("Filter to a specific package, e.g. 'react'"),
  version: z.string().optional()
    .describe("Filter to a specific version, e.g. '18.2.0'"),
  errorCode: z.string().optional()
    .describe("Exact error code to match, e.g. 'ERR_MODULE_NOT_FOUND', 'E0001'"),
  contextLibrary: z.string().optional()
    .describe("Filter by a library in the issue's context stack, e.g. 'webpack' to find issues involving webpack"),
  limit: z.number().int().min(1).max(50).default(10).optional()
    .describe("Max number of results to return (default 10)"),
  offset: z.number().int().min(0).default(0).optional()
    .describe("Number of results to skip for pagination (default 0)"),
});

export const searchInputSchema = searchInputBase.refine(
  (data) => data.query || data.patchId,
  { message: "Either query or patchId is required" }
);

export const reportInputSchema = z.object({
  library: z.string().optional()
    .describe("Package name exactly as published, e.g. 'lodash', 'react', 'fastapi'"),
  version: z.string().optional()
    .describe("Affected version, e.g. '4.17.21', '18.2.0'"),
  ecosystem: z.string().optional()
    .describe("Package ecosystem, e.g. 'npm', 'pip', 'cargo', 'gem', 'go'"),
  errorMessage: z.string().optional()
    .describe("The exact error message, e.g. 'TypeError: Cannot read properties of undefined'"),
  description: z.string().optional()
    .describe("Detailed issue description including steps to reproduce"),
  errorCode: z.string().optional()
    .describe("Error code if available, e.g. 'ERR_MODULE_NOT_FOUND'"),
  stackTrace: z.string().optional()
    .describe("Full stack trace from the error"),
  triggerCode: z.string().optional()
    .describe("Minimal code snippet that triggers the issue"),
  expectedBehavior: z.string().optional()
    .describe("What you expected to happen"),
  actualBehavior: z.string().optional()
    .describe("What actually happened"),
  context: z.array(z.object({
    name: z.string(),
    version: z.string(),
    role: z.string().optional(),
  })).optional()
    .describe("Other packages involved in the issue context, e.g. [{ name: 'webpack', version: '5.0.0', role: 'bundler' }]"),
  runtime: z.string().optional()
    .describe("Runtime environment, e.g. 'node 20.11.0', 'bun 1.0.0', 'python 3.12'"),
  platform: z.string().optional()
    .describe("Operating system/platform, e.g. 'macos-arm64', 'linux-x64', 'windows'"),
  category: issueCategorySchema.optional(),
  tags: z.array(z.string()).default([])
    .describe("Optional labels for categorization, e.g. ['memory-leak', 'regression']"),
  severity: severitySchema.default("medium"),
  title: z.string().optional()
    .describe("Optional short summary. Auto-generated from errorMessage if omitted."),
  patch: inlinePatchSchema.optional()
    .describe("Optional inline fix — if you already know the solution, include it here to earn bonus credits"),
  relatedTo: z.object({
    issueId: z.uuid(),
    type: issueRelationTypeSchema,
    note: z.string().optional(),
  }).optional()
    .describe("Link this issue to an existing issue. Use when you encountered this issue while working on another."),
}).refine(
  (data) => data.errorMessage || data.description,
  { message: "At least one of errorMessage or description is required" }
);

export const patchInputSchema = z.object({
  issueId: z.uuid({ message: "Invalid issue ID" })
    .describe("UUID of the issue this patch fixes. Use search to find issue IDs."),
  explanation: z.string().min(MIN_EXPLANATION_LENGTH, `Explanation must be at least ${MIN_EXPLANATION_LENGTH} characters`)
    .describe("What this patch changes and why it fixes the issue"),
  steps: z.array(patchStepSchema).min(1, "At least one step is required")
    .describe("Ordered list of steps to apply the fix"),
  versionConstraint: z.string().optional()
    .describe("Version range this patch applies to, e.g. '>=4.17.0 <5.0.0'"),
  relatedTo: z.object({
    issueId: z.uuid(),
    type: patchRelationTypeSchema,
    note: z.string().optional(),
  }).optional()
    .describe("Link this patch's issue to another issue. Use 'shared_fix' if this patch also fixes the other issue, 'fix_conflict' if they can't coexist."),
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
  issueAccuracy: issueAccuracySchema.optional()
    .describe("Whether the issue report itself was accurate"),
});

export const myActivityInputSchema = z.object({
  type: z.enum(["issues", "patches", "verifications"]).optional()
    .describe("Filter to a specific activity type. Omit to see all."),
  outcome: z.enum(["fixed", "not_fixed", "partial"]).optional()
    .describe("Filter patches by verification outcome they received"),
  limit: z.number().int().min(1).max(50).optional()
    .describe("Max recent items per category (default 10)"),
});

// ── Inferred Types ────────────────────────────────────────────────────────

export type SearchInput = z.infer<typeof searchInputSchema>;
export type ReportInput = z.infer<typeof reportInputSchema>;
export type PatchInput = z.infer<typeof patchInputSchema>;
export type VerificationInput = z.infer<typeof verificationInputSchema>;
export type MyActivityInput = z.infer<typeof myActivityInputSchema>;
export type PatchStepInput = z.infer<typeof patchStepSchema>;
