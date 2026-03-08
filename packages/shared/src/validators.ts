import { z } from "zod";
import { MIN_TITLE_LENGTH, MIN_DESCRIPTION_LENGTH } from "./constants";

export const severitySchema = z.enum(["low", "medium", "high", "critical"])
  .describe("Bug severity: low, medium, high, or critical");
export const bugStatusSchema = z.enum(["open", "confirmed", "patched", "closed"]);
export const voteSchema = z.enum(["up", "down"])
  .describe("Vote direction: 'up' to endorse, 'down' to flag issues");

export const bugInputSchema = z.object({
  title: z.string().min(MIN_TITLE_LENGTH, `Title must be at least ${MIN_TITLE_LENGTH} characters`)
    .describe("Short summary of the bug, e.g. 'lodash.merge crashes on circular refs in v4.17.21'"),
  description: z.string().min(MIN_DESCRIPTION_LENGTH, `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters`)
    .describe("Detailed bug description including steps to reproduce, expected vs actual behavior, and error messages"),
  library: z.string().min(1, "Library is required")
    .describe("Package name exactly as published, e.g. 'lodash', 'react', 'fastapi'"),
  version: z.string().min(1, "Version is required")
    .describe("Affected version, e.g. '4.17.21', '18.2.0'"),
  ecosystem: z.string().min(1, "Ecosystem is required")
    .describe("Package ecosystem, e.g. 'npm', 'pip', 'cargo', 'gem', 'go'"),
  severity: severitySchema,
  tags: z.array(z.string()).default([])
    .describe("Optional labels for categorization, e.g. ['memory-leak', 'regression', 'typescript']"),
});

export const patchInputSchema = z.object({
  bugId: z.uuid({ message: "Invalid bug ID" })
    .describe("UUID of the bug this patch fixes. Use search_bugs to find bug IDs."),
  description: z.string().min(1, "Description is required")
    .describe("What this patch changes and why it fixes the bug"),
  code: z.string().min(1, "Code is required")
    .describe("The fix as a code snippet, diff, or patch. Include enough context to apply the change."),
});

export const reviewInputSchema = z.object({
  patchId: z.uuid({ message: "Invalid patch ID" })
    .describe("UUID of the patch to review. Get patch IDs from get_bug results."),
  vote: voteSchema,
  comment: z.string().nullable().default(null)
    .describe("Optional review comment explaining your vote"),
});

export const searchBugsInputSchema = z.object({
  query: z.string().min(1, "Search query is required")
    .describe("Natural language search query, e.g. 'memory leak in React useEffect cleanup'"),
  library: z.string().optional()
    .describe("Filter to a specific package, e.g. 'react'"),
  version: z.string().optional()
    .describe("Filter to a specific version, e.g. '18.2.0'"),
  ecosystem: z.string().optional()
    .describe("Filter to an ecosystem, e.g. 'npm', 'pip'"),
  limit: z.number().int().min(1).max(50).default(10)
    .describe("Max results to return (1-50, default 10)"),
  offset: z.number().int().min(0).default(0)
    .describe("Number of results to skip for pagination (default 0)"),
});

export const getBugInputSchema = z.object({
  bugId: z.uuid({ message: "Invalid bug ID" })
    .describe("UUID of the bug to retrieve. Get bug IDs from search_bugs results."),
});

export const bugUpdateSchema = z.object({
  title: z.string().min(MIN_TITLE_LENGTH).optional(),
  description: z.string().min(MIN_DESCRIPTION_LENGTH).optional(),
  severity: severitySchema.optional(),
  status: bugStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
});

export const updateBugStatusInputSchema = z.object({
  bugId: z.uuid({ message: "Invalid bug ID" })
    .describe("UUID of the bug to update. Get bug IDs from search_bugs or list_bugs results."),
  status: bugStatusSchema
    .describe("New status: 'open', 'confirmed', 'patched', or 'closed'"),
});

export const listBugsInputSchema = z.object({
  library: z.string().optional()
    .describe("Filter to a specific package, e.g. 'react'"),
  version: z.string().optional()
    .describe("Filter to a specific version, e.g. '18.2.0'"),
  ecosystem: z.string().optional()
    .describe("Filter to an ecosystem, e.g. 'npm', 'pip'"),
  status: z.string().optional()
    .describe("Filter by status: 'open', 'confirmed', 'patched', or 'closed'"),
  severity: z.string().optional()
    .describe("Filter by severity: 'low', 'medium', 'high', or 'critical'"),
  limit: z.number().int().min(1).max(50).default(20)
    .describe("Max results to return (1-50, default 20)"),
  offset: z.number().int().min(0).default(0)
    .describe("Number of results to skip for pagination (default 0)"),
});

export const getBugHistoryInputSchema = z.object({
  bugId: z.uuid({ message: "Invalid bug ID" })
    .describe("UUID of the bug to get history for"),
  limit: z.number().int().min(1).max(50).default(10)
    .describe("Max revisions to return (1-50, default 10)"),
  offset: z.number().int().min(0).default(0)
    .describe("Number of revisions to skip for pagination (default 0)"),
});

export const rollbackBugInputSchema = z.object({
  bugId: z.uuid({ message: "Invalid bug ID" }),
  version: z.number().int().min(1),
});

export type BugInput = z.infer<typeof bugInputSchema>;
export type BugUpdate = z.infer<typeof bugUpdateSchema>;
export type PatchInput = z.infer<typeof patchInputSchema>;
export type ReviewInput = z.infer<typeof reviewInputSchema>;
export type SearchBugsInput = z.infer<typeof searchBugsInputSchema>;
export type GetBugInput = z.infer<typeof getBugInputSchema>;
export type GetBugHistoryInput = z.infer<typeof getBugHistoryInputSchema>;
export type RollbackBugInput = z.infer<typeof rollbackBugInputSchema>;
