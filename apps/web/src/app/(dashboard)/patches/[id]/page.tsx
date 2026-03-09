"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Clock, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime, formatDate, initials } from "@/lib/helpers";
import { fetchPatchById } from "@/app/actions/patches";
import type { Patch, PatchStep, Verification } from "@knownissue/shared";

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

export default function PatchDetailPage() {
  const params = useParams<{ id: string }>();
  const [patch, setPatch] = useState<(Patch & { issue?: { id: string; title: string } }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const patchData = await fetchPatchById(params.id);
        if (!cancelled) {
          setPatch(patchData);
        }
      } catch {
        // patch not found
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [params.id]);

  const verifications = (patch?.verifications ?? []) as Verification[];
  const fixedCount = verifications.filter((v) => v.outcome === "fixed").length;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-6 w-80" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!patch) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="font-mono text-sm text-muted-foreground">patch not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
        <Link href="/activity" className="hover:text-foreground transition-colors">activity</Link>
        <span>/</span>
        {patch.issue ? (
          <Link href={`/issues/${patch.issue.id}`} className="hover:text-foreground transition-colors">
            KI-{patch.issue.id.slice(0, 8)}
          </Link>
        ) : (
          <span>{patch.issueId.slice(0, 8)}</span>
        )}
        <span>/</span>
        <span className="text-foreground">patch</span>
      </nav>

      {/* Issue context */}
      {patch.issue && (
        <Link
          href={`/issues/${patch.issue.id}`}
          className="block rounded-lg border border-border px-4 py-3 hover:bg-secondary/50 transition-colors"
        >
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">fix for</p>
          <p className="mt-1 text-sm font-medium">{patch.issue.title}</p>
        </Link>
      )}

      {/* Patch header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={patch.submitter?.avatarUrl ?? undefined} />
            <AvatarFallback className="text-xs">
              {initials(patch.submitter?.githubUsername ?? "??")}
            </AvatarFallback>
          </Avatar>
          <div>
            <span className="font-mono text-sm font-medium">
              {patch.submitter?.githubUsername ?? "anonymous"}
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(new Date(patch.createdAt))}
              </span>
              {patch.versionConstraint && (
                <Badge variant="outline" className="text-[10px]">
                  {patch.versionConstraint}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Verification summary */}
        {verifications.length > 0 && (
          <Badge
            variant="outline"
            className={`font-mono text-sm tabular-nums ${
              fixedCount > verifications.length / 2
                ? "bg-green-500/15 text-green-400 border-green-500/25"
                : "bg-yellow-500/15 text-yellow-400 border-yellow-500/25"
            }`}
          >
            fixed by {fixedCount}/{verifications.length}
          </Badge>
        )}
      </div>

      <Separator />

      {/* Description */}
      <div className="space-y-1.5">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          explanation
        </h2>
        <p className="text-sm leading-relaxed text-foreground/90">{patch.explanation}</p>
      </div>

      {/* Structured steps */}
      {(patch.steps as PatchStep[] ?? []).length > 0 && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            steps
          </h2>
          <div className="space-y-2">
            {(patch.steps as PatchStep[]).map((step, i) => (
              <div key={i} className="rounded-md border border-border bg-background p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 font-mono text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {step.type.replace("_", " ")}
                  </Badge>
                  {step.type === "code_change" && (
                    <span className="font-mono text-xs text-muted-foreground">{step.filePath}</span>
                  )}
                  {step.type === "version_bump" && (
                    <span className="font-mono text-xs text-muted-foreground">{step.package} → {step.to}</span>
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
            ))}
          </div>
        </div>
      )}

      {/* Legacy code fallback */}
      {(patch.steps as PatchStep[] ?? []).length === 0 && patch.code && (
        <div className="space-y-1.5">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            code
          </h2>
          <div className="overflow-x-auto rounded-md border border-border bg-background p-3">
            <pre className="font-mono text-xs leading-relaxed text-foreground whitespace-pre">
              {patch.code}
            </pre>
          </div>
        </div>
      )}

      <Separator />

      {/* Verifications */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          verifications ({verifications.length})
        </h2>
        {verifications.length === 0 ? (
          <p className="text-sm text-muted-foreground font-mono">no verifications yet.</p>
        ) : (
          <div className="space-y-2">
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
