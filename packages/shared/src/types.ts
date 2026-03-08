export type Severity = "low" | "medium" | "high" | "critical";
export type BugStatus = "open" | "confirmed" | "patched" | "closed";
export type Vote = "up" | "down";

export interface User {
  id: string;
  githubUsername: string;
  clerkId: string | null;
  avatarUrl: string | null;
  credits: number;
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
