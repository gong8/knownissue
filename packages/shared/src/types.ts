export type Severity = "low" | "medium" | "high" | "critical";
export type BugStatus = "open" | "confirmed" | "patched" | "closed";
export type Vote = "up" | "down";
export type Role = "user" | "admin";
export type AuditAction = "create" | "update" | "delete" | "rollback";
export type EntityType = "bug" | "patch" | "review" | "user";
export type ReviewTargetType = "bug" | "patch";
export type PatchStepType = "code_change" | "version_bump" | "config_change" | "command";

// Patch step interfaces
export interface CodeChangeStep {
  type: "code_change";
  filePath: string;
  language?: string;
  before: string;
  after: string;
}

export interface VersionBumpStep {
  type: "version_bump";
  package: string;
  to: string;
}

export interface ConfigChangeStep {
  type: "config_change";
  file: string;
  key: string;
  action: "set" | "delete";
  value?: string;
}

export interface CommandStep {
  type: "command";
  command: string;
}

export type PatchStep = CodeChangeStep | VersionBumpStep | ConfigChangeStep | CommandStep;

export interface RelatedLibrary {
  name: string;
  version: string;
}

export interface Environment {
  node?: string;
  os?: string;
  framework?: string;
}

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
  title: string | null;
  description: string | null;
  library: string;
  version: string;
  ecosystem: string;
  severity: Severity;
  status: BugStatus;
  tags: string[];
  embedding: number[] | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  stackTrace?: string | null;
  fingerprint?: string | null;
  triggerCode?: string | null;
  expectedBehavior?: string | null;
  actualBehavior?: string | null;
  relatedLibraries?: RelatedLibrary[] | null;
  environment?: Environment | null;
  score: number;
  reporterId: string;
  reporter?: User;
  patches?: Patch[];
  reviews?: Review[];
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
  snapshot?: Record<string, unknown> | null;
  bugId: string;
  actorId: string;
  createdAt: Date;
}

export interface Patch {
  id: string;
  explanation: string;
  steps: PatchStep[];
  code?: string | null;
  score: number;
  versionConstraint?: string | null;
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
  note: string | null;
  targetId: string;
  targetType: ReviewTargetType;
  version?: string | null;
  patchId?: string | null;
  patch?: Patch;
  bugId?: string | null;
  bug?: Bug;
  reviewerId: string;
  reviewer?: User;
  createdAt: Date;
  updatedAt: Date;
}
