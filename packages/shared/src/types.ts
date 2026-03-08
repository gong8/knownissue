export type Severity = "low" | "medium" | "high" | "critical";
export type BugStatus = "open" | "confirmed" | "patched" | "closed";
export type Vote = "up" | "down";
export type Role = "user" | "admin";
export type AuditAction = "create" | "update" | "delete" | "rollback";
export type EntityType = "bug" | "patch" | "review" | "user";

export interface User {
  id: string;
  githubUsername: string;
  clerkId: string | null;
  avatarUrl: string | null;
  credits: number;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface Bug {
  id: string;
  title: string;
  description: string;
  library: string;
  version: string;
  ecosystem: string;
  severity: Severity;
  status: BugStatus;
  tags: string[];
  embedding: number[] | null;
  reporterId: string;
  reporter?: User;
  patches?: Patch[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: string;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  metadata: Record<string, unknown> | null;
  actorId: string;
  actor?: User;
  createdAt: Date;
}

export interface BugRevision {
  id: string;
  version: number;
  action: AuditAction;
  title: string;
  description: string;
  severity: Severity;
  status: BugStatus;
  tags: string[];
  bugId: string;
  actorId: string;
  createdAt: Date;
}

export interface Patch {
  id: string;
  description: string;
  code: string;
  score: number;
  bugId: string;
  bug?: Bug;
  submitterId: string;
  submitter?: User;
  reviews?: Review[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Review {
  id: string;
  vote: Vote;
  comment: string | null;
  patchId: string;
  patch?: Patch;
  reviewerId: string;
  reviewer?: User;
  createdAt: Date;
  updatedAt: Date;
}
