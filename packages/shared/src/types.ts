export type Severity = "low" | "medium" | "high" | "critical";
export type BugStatus = "open" | "confirmed" | "patched" | "closed";
export type VerificationOutcome = "fixed" | "not_fixed" | "partial";
export type BugAccuracy = "accurate" | "inaccurate";
export type BugCategory = "crash" | "build" | "types" | "performance" | "behavior" | "config" | "compatibility" | "install";
export type Role = "user" | "admin";
export type AuditAction = "create" | "update" | "delete" | "rollback";
export type EntityType = "bug" | "patch" | "verification" | "user";
export type PatchStepType = "code_change" | "version_bump" | "config_change" | "command";
export type BugRelationType = "same_root_cause" | "version_regression" | "cascading_dependency" | "interaction_conflict" | "shared_fix" | "fix_conflict";
export type RelationSource = "agent" | "system";

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

export interface ContextLibrary {
  name: string;
  version: string;
  role?: string;
}

export interface User {
  id: string;
  githubUsername: string | null;
  clerkId: string;
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
  context?: ContextLibrary[] | null;
  contextLibraries?: string[];
  runtime?: string | null;
  platform?: string | null;
  category?: BugCategory | null;
  accessCount: number;
  searchHitCount: number;
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
  bug?: { id: string; title: string };
  submitterId: string;
  submitter?: User;
  verifications?: Verification[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Verification {
  id: string;
  outcome: VerificationOutcome;
  note: string | null;
  errorBefore?: string | null;
  errorAfter?: string | null;
  testedVersion?: string | null;
  bugAccuracy?: BugAccuracy;
  patchId: string;
  patch?: Patch;
  verifierId: string;
  verifier?: User;
  createdAt: Date;
}

export interface BugRelation {
  id: string;
  type: BugRelationType;
  source: RelationSource;
  confidence: number;
  metadata: Record<string, unknown> | null;
  sourceBugId: string;
  targetBugId: string;
  createdById: string | null;
  createdAt: Date;
}
