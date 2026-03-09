export type Severity = "low" | "medium" | "high" | "critical";
export type IssueStatus = "open" | "confirmed" | "patched" | "closed";
export type VerificationOutcome = "fixed" | "not_fixed" | "partial";
export type IssueAccuracy = "accurate" | "inaccurate";
export type IssueCategory = "crash" | "build" | "types" | "performance" | "behavior" | "config" | "compatibility" | "install" | "hallucination" | "deprecated";
export type AuditAction = "create" | "update" | "delete" | "rollback";
export type EntityType = "issue" | "patch" | "verification" | "user";
export type PatchStepType = "code_change" | "version_bump" | "config_change" | "command" | "instruction";
export type IssueRelationType = "same_root_cause" | "version_regression" | "cascading_dependency" | "interaction_conflict" | "shared_fix" | "fix_conflict";
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

export interface InstructionStep {
  type: "instruction";
  text: string;
}

export type PatchStep = CodeChangeStep | VersionBumpStep | ConfigChangeStep | CommandStep | InstructionStep;

export interface ContextLibrary {
  name: string;
  version: string;
  role?: string;
}

export interface User {
  id: string;
  clerkId: string;
  avatarUrl: string | null;
  credits: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Issue {
  id: string;
  title: string | null;
  description: string | null;
  library: string | null;
  version: string | null;
  ecosystem: string | null;
  severity: Severity;
  status: IssueStatus;
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
  category?: IssueCategory | null;
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

export interface IssueRevision {
  id: string;
  version: number;
  action: AuditAction;
  title: string;
  description: string;
  severity: Severity;
  status: IssueStatus;
  tags: string[];
  snapshot?: Record<string, unknown> | null;
  issueId: string;
  actorId: string;
  createdAt: Date;
}

export interface Patch {
  id: string;
  explanation: string;
  steps: PatchStep[];
  code?: string | null;
  versionConstraint?: string | null;
  issueId: string;
  issue?: { id: string; title: string };
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
  issueAccuracy?: IssueAccuracy;
  patchId: string;
  patch?: Patch;
  verifierId: string;
  verifier?: User;
  createdAt: Date;
}

export interface IssueRelation {
  id: string;
  type: IssueRelationType;
  source: RelationSource;
  confidence: number;
  metadata: Record<string, unknown> | null;
  sourceIssueId: string;
  targetIssueId: string;
  createdById: string | null;
  createdAt: Date;
}
