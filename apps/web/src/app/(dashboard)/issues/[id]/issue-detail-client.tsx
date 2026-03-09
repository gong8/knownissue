"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileCode,
  Clock,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { relativeTime, formatDate, initials } from "@/lib/helpers";
import type { Issue, Patch, Severity, PatchStep, Verification } from "@knownissue/shared";

type RelatedIssue = {
  id: string;
  type: string;
  title: string | null;
  library: string;
  version: string;
  confidence: number;
};

type IssueWithRelations = Issue & { relatedIssues?: RelatedIssue[] };

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-zinc-400",
};

const OUTCOME_ICON = {
  fixed: CheckCircle2,
  not_fixed: XCircle,
  partial: MinusCircle,
};

const OUTCOME_COLOR = {
  fixed: "text-green-400",
  not_fixed: "text-red-400",
  partial: "text-yellow-400",
};

// -- Structured Step Renderer --

function PatchStepDisplay({ step, index }: { step: PatchStep; index: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 font-mono text-[10px] font-bold text-primary">
          {index + 1}
        </span>
        <Badge variant="outline" className="text-[10px] uppercase">
          {step.type.replace("_", " ")}
        </Badge>
        {step.type === "code_change" && (
          <span className="font-mono text-xs text-muted-foreground">{step.filePath}</span>
        )}
        {step.type === "version_bump" && (
          <span className="font-mono text-xs text-muted-foreground">{step.package} &rarr; {step.to}</span>
        )}
        {step.type === "config_change" && (
          <span className="font-mono text-xs text-muted-foreground">{step.file} [{step.key}]</span>
        )}
      </div>

      {step.type === "code_change" && (
        <div className="space-y-1.5">
          {step.before && (
            <pre className="font-mono text-xs leading-relaxed bg-red-500/5 border-l-2 border-red-400/40 p-2 rounded overflow-x-auto whitespace-pre">
              {step.before}
            </pre>
          )}
          <pre className="font-mono text-xs leading-relaxed bg-green-500/5 border-l-2 border-green-400/40 p-2 rounded overflow-x-auto whitespace-pre">
            {step.after}
          </pre>
        </div>
      )}

      {step.type === "command" && (
        <pre className="font-mono text-xs bg-secondary/50 p-2 rounded overflow-x-auto whitespace-pre">
          $ {step.command}
        </pre>
      )}

      {step.type === "config_change" && (
        <div className="font-mono text-xs">
          <span className="text-muted-foreground">{step.action}:</span>{" "}
          {step.value && <span>{step.value}</span>}
        </div>
      )}

      {step.type === "instruction" && (
        <p className="text-sm leading-relaxed text-foreground/90">{step.text}</p>
      )}
    </div>
  );
}

// -- Verification Summary --

function VerificationSummary({ verifications }: { verifications: Verification[] }) {
  if (verifications.length === 0) return null;

  const fixed = verifications.filter((v) => v.outcome === "fixed").length;
  const total = verifications.length;

  return (
    <Badge
      variant="outline"
      className={`font-mono text-xs tabular-nums ${
        fixed > total / 2
          ? "bg-green-500/15 text-green-400 border-green-500/25"
          : "bg-yellow-500/15 text-yellow-400 border-yellow-500/25"
      }`}
    >
      fixed by {fixed}/{total}
    </Badge>
  );
}

// -- Patch Row Component --

function PatchRow({
  patch,
  rank,
  active,
}: {
  patch: Patch;
  rank: number;
  active?: boolean;
}) {
  const verifications = (patch.verifications ?? []) as Verification[];
  const steps = (patch.steps ?? []) as PatchStep[];

  return (
    <div className={`py-4 ${active ? "bg-surface-hover" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-bold text-primary">
            #{rank}
          </span>
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              <AvatarImage src={patch.submitter?.avatarUrl ?? undefined} />
              <AvatarFallback className="text-[9px]">
                {initials(patch.submitter?.githubUsername ?? "??")}
              </AvatarFallback>
            </Avatar>
            <span className="font-mono text-sm">
              {patch.submitter?.githubUsername ?? "anonymous"}
            </span>
            <span className="text-xs text-muted-foreground">
              {relativeTime(new Date(patch.createdAt))}
            </span>
            {patch.versionConstraint && (
              <Badge variant="outline" className="text-[10px]">
                {patch.versionConstraint}
              </Badge>
            )}
          </div>
        </div>

        {/* Verification summary */}
        <VerificationSummary verifications={verifications} />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{patch.explanation}</p>

      {/* Structured steps */}
      {steps.length > 0 && (
        <div className="mt-3 space-y-2">
          {steps.map((step, i) => (
            <PatchStepDisplay key={i} step={step} index={i} />
          ))}
        </div>
      )}

      {/* Legacy code block fallback */}
      {steps.length === 0 && patch.code && (
        <div className="mt-3 overflow-x-auto rounded-md border border-border bg-background p-3">
          <pre className="font-mono text-xs leading-relaxed text-foreground whitespace-pre">
            {patch.code}
          </pre>
        </div>
      )}

      {/* Verifications */}
      {verifications.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            verifications
          </p>
          {verifications.map((v) => {
            const Icon = OUTCOME_ICON[v.outcome];
            return (
              <div
                key={v.id}
                className="flex items-start gap-2 rounded-md bg-secondary/50 px-3 py-2"
              >
                <div className="mt-0.5">
                  <Icon className={`h-3 w-3 ${OUTCOME_COLOR[v.outcome]}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium">
                      {v.verifier?.githubUsername ?? "anonymous"}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {v.outcome.replace("_", " ")}
                    </Badge>
                    {v.testedVersion && (
                      <Badge variant="outline" className="text-[10px]">
                        v{v.testedVersion}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(new Date(v.createdAt))}
                    </span>
                  </div>
                  {v.note && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {v.note}
                    </p>
                  )}
                  {v.errorBefore && (
                    <div className="mt-1 text-xs">
                      <span className="text-red-400">before:</span>{" "}
                      <code className="font-mono text-muted-foreground">{v.errorBefore}</code>
                    </div>
                  )}
                  {v.errorAfter && (
                    <div className="mt-1 text-xs">
                      <span className="text-green-400">after:</span>{" "}
                      <code className="font-mono text-muted-foreground">{v.errorAfter}</code>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -- Issue Detail Client Component --

export function IssueDetailClient({
  issueId,
  initialIssue,
}: {
  issueId: string;
  initialIssue: IssueWithRelations;
}) {
  const router = useRouter();
  const [issue] = useState<IssueWithRelations>(initialIssue);
  const [focusedPatch, setFocusedPatch] = useState(-1);
  const [stackTraceOpen, setStackTraceOpen] = useState(false);

  const sortedPatches = [...(issue.patches ?? [])].sort((a, b) => b.score - a.score);
  const displayTitle = issue.title ?? issue.errorMessage ?? "Untitled";

  // Keyboard: U to go back, J/K between patches
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;

      if (e.key === "u") {
        e.preventDefault();
        router.push("/explore");
      } else if (e.key === "j") {
        e.preventDefault();
        setFocusedPatch((prev) => Math.min(prev + 1, sortedPatches.length - 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setFocusedPatch((prev) => Math.max(prev - 1, 0));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, sortedPatches.length]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
        <Link href="/explore" className="hover:text-foreground transition-colors">
          explore
        </Link>
        <span>/</span>
        <span className="text-foreground">KI-{issue.id.slice(0, 8)}</span>
      </nav>

      {/* Issue header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-lg font-semibold leading-tight">{displayTitle}</h1>

          {/* Access count badge & search hit count */}
          <div className="flex items-center gap-2 shrink-0">
            {issue.searchHitCount > 0 && (
              <span className="text-xs text-muted-foreground">
                found in {issue.searchHitCount} searches
              </span>
            )}
            {issue.accessCount > 0 && (
              <Badge
                variant="outline"
                className="shrink-0 bg-blue-500/15 text-blue-400 border-blue-500/25 font-mono text-xs tabular-nums"
              >
                <Users className="mr-1 h-3 w-3" />
                {issue.accessCount} agents reached
              </Badge>
            )}
          </div>
        </div>

        {/* Compact badge row */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="dot" dotColor={SEVERITY_DOT[issue.severity]}>{issue.severity}</Badge>
          <Badge variant="dot" dotColor={
            issue.status === "open" ? "bg-blue-400" :
            issue.status === "confirmed" ? "bg-purple-400" :
            issue.status === "patched" ? "bg-green-400" : "bg-zinc-400"
          }>{issue.status}</Badge>
          <Badge variant="secondary" className="font-mono text-xs">
            {issue.library}@{issue.version}
          </Badge>
          <Badge variant="outline" className="text-xs">{issue.ecosystem}</Badge>
          {issue.errorCode && (
            <Badge variant="destructive" className="font-mono text-xs">
              {issue.errorCode}
            </Badge>
          )}
          {issue.category && (
            <Badge variant="outline" className="text-xs">
              {issue.category}
            </Badge>
          )}
          {issue.tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="text-xs text-muted-foreground"
            >
              {tag}
            </Badge>
          ))}
        </div>

        {/* Context libraries */}
        {issue.contextLibraries && issue.contextLibraries.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-mono text-muted-foreground">context:</span>
            {issue.contextLibraries.map((lib) => (
              <Badge key={lib} variant="secondary" className="font-mono text-[10px]">
                {lib}
              </Badge>
            ))}
          </div>
        )}

        {/* Runtime/Platform */}
        {(issue.runtime || issue.platform) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {issue.runtime && <span className="font-mono">{issue.runtime}</span>}
            {issue.platform && <span className="font-mono">{issue.platform}</span>}
          </div>
        )}

        {/* Reporter info */}
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={issue.reporter?.avatarUrl ?? undefined} />
            <AvatarFallback className="text-[9px]">
              {initials(issue.reporter?.githubUsername ?? "??")}
            </AvatarFallback>
          </Avatar>
          <span className="font-mono text-sm">
            {issue.reporter?.githubUsername ?? "anonymous"}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDate(new Date(issue.createdAt))}
          </span>
        </div>
      </div>

      <Separator />

      {/* Error message (highlighted) */}
      {issue.errorMessage && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            error message
          </h2>
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
            <pre className="font-mono text-sm text-red-400 whitespace-pre-wrap">{issue.errorMessage}</pre>
          </div>
        </div>
      )}

      {/* Description */}
      {issue.description && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            description
          </h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {issue.description}
          </div>
        </div>
      )}

      {/* Trigger code */}
      {issue.triggerCode && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            trigger code
          </h2>
          <div className="overflow-x-auto rounded-md border border-border bg-background p-3">
            <pre className="font-mono text-xs leading-relaxed whitespace-pre">{issue.triggerCode}</pre>
          </div>
        </div>
      )}

      {/* Expected vs Actual */}
      {(issue.expectedBehavior || issue.actualBehavior) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {issue.expectedBehavior && (
            <div className="space-y-1.5">
              <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                expected
              </h2>
              <div className="rounded-md border border-green-500/20 bg-green-500/5 p-3 text-sm">
                {issue.expectedBehavior}
              </div>
            </div>
          )}
          {issue.actualBehavior && (
            <div className="space-y-1.5">
              <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                actual
              </h2>
              <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-sm">
                {issue.actualBehavior}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stack trace (collapsible) */}
      {issue.stackTrace && (
        <div className="space-y-1.5">
          <button
            onClick={() => setStackTraceOpen(!stackTraceOpen)}
            className="flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            {stackTraceOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            stack trace
          </button>
          {stackTraceOpen && (
            <div className="overflow-x-auto rounded-md border border-border bg-background p-3">
              <pre className="font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre">
                {issue.stackTrace}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Related issues */}
      {issue.relatedIssues && issue.relatedIssues.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            related issues
          </h3>
          <div className="space-y-1.5">
            {issue.relatedIssues.map((rel) => (
              <Link
                key={rel.id}
                href={`/issues/${rel.id}`}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary/50 transition-colors"
              >
                <Badge variant="outline" className="text-[10px] shrink-0">{rel.type.replace(/_/g, " ")}</Badge>
                <span className="font-medium truncate">{rel.title ?? `${rel.library}@${rel.version}`}</span>
                {rel.confidence < 1.0 && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {rel.confidence >= 0.7 ? "high confidence" : "moderate"}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      <Separator />

      {/* Patches header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono">
          patches{" "}
          <span className="text-muted-foreground">
            ({sortedPatches.length})
          </span>
        </h2>
      </div>

      {/* Patches list */}
      {sortedPatches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileCode className="mb-2 h-6 w-6" />
          <p className="font-mono text-sm">no patches yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {sortedPatches.map((patch, i) => (
            <PatchRow
              key={patch.id}
              patch={patch}
              rank={i + 1}
              active={focusedPatch === i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
