import { z } from "zod";
import { MIN_TITLE_LENGTH, MIN_DESCRIPTION_LENGTH } from "./constants";

export const severitySchema = z.enum(["low", "medium", "high", "critical"]);
export const bugStatusSchema = z.enum(["open", "confirmed", "patched", "closed"]);
export const voteSchema = z.enum(["up", "down"]);

export const bugInputSchema = z.object({
  title: z.string().min(MIN_TITLE_LENGTH, `Title must be at least ${MIN_TITLE_LENGTH} characters`),
  description: z.string().min(MIN_DESCRIPTION_LENGTH, `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters`),
  library: z.string().min(1, "Library is required"),
  version: z.string().min(1, "Version is required"),
  ecosystem: z.string().min(1, "Ecosystem is required"),
  severity: severitySchema,
  tags: z.array(z.string()).default([]),
});

export const patchInputSchema = z.object({
  bugId: z.string().uuid("Invalid bug ID"),
  description: z.string().min(1, "Description is required"),
  code: z.string().min(1, "Code is required"),
});

export const reviewInputSchema = z.object({
  patchId: z.string().uuid("Invalid patch ID"),
  vote: voteSchema,
  comment: z.string().nullable().default(null),
});

export const searchBugsInputSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  library: z.string().optional(),
  version: z.string().optional(),
  ecosystem: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
  offset: z.number().int().min(0).default(0),
});

export type BugInput = z.infer<typeof bugInputSchema>;
export type PatchInput = z.infer<typeof patchInputSchema>;
export type ReviewInput = z.infer<typeof reviewInputSchema>;
export type SearchBugsInput = z.infer<typeof searchBugsInputSchema>;
