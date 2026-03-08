"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reportInputSchema } from "@knownissue/shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Severity } from "@knownissue/shared";

type FieldErrors = Record<string, string | undefined>;

const ecosystems = ["node", "python", "go", "rust", "other"] as const;
const severities: Severity[] = ["low", "medium", "high", "critical"];

export default function NewBugPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [stackTrace, setStackTrace] = useState("");
  const [triggerCode, setTriggerCode] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [actualBehavior, setActualBehavior] = useState("");
  const [library, setLibrary] = useState("");
  const [version, setVersion] = useState("");
  const [ecosystem, setEcosystem] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [tagsInput, setTagsInput] = useState("");
  const [includePatch, setIncludePatch] = useState(false);
  const [patchExplanation, setPatchExplanation] = useState("");
  const [patchCode, setPatchCode] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErrors({});

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const input: Record<string, unknown> = {
      library,
      version,
      ecosystem,
      severity,
      tags,
    };

    if (title) input.title = title;
    if (description) input.description = description;
    if (errorMessage) input.errorMessage = errorMessage;
    if (errorCode) input.errorCode = errorCode;
    if (stackTrace) input.stackTrace = stackTrace;
    if (triggerCode) input.triggerCode = triggerCode;
    if (expectedBehavior) input.expectedBehavior = expectedBehavior;
    if (actualBehavior) input.actualBehavior = actualBehavior;
    if (includePatch && patchExplanation && patchCode) {
      input.patch = {
        explanation: patchExplanation,
        steps: [{
          type: "code_change",
          filePath: "unknown",
          before: "",
          after: patchCode,
        }],
      };
    }

    const result = reportInputSchema.safeParse(input);

    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString() ?? "_root";
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const { createBug } = await import("@/app/actions/bugs");
      const response = await createBug(result.data);
      const credits = response?.creditsAwarded ?? 3;
      toast.success("Bug reported successfully!", {
        description: `+${credits} credits earned`,
      });
      router.push("/bugs");
    } catch (err) {
      toast.error("Failed to submit bug report", {
        description: err instanceof Error ? err.message : "The API server may be unavailable.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Cmd+Enter to submit
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <nav className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
        <Link href="/bugs" className="hover:text-foreground transition-colors">
          bugs
        </Link>
        <span>/</span>
        <span className="text-foreground">new</span>
      </nav>

      <PageHeader title="report a bug" />

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Root-level error (from .refine) */}
        {errors._root && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
            <p className="text-xs text-destructive">{errors._root}</p>
          </div>
        )}

        {/* Library + Version (required) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="library" className="text-xs font-mono text-muted-foreground">
              library *
            </label>
            <Input
              id="library"
              placeholder="e.g. react"
              value={library}
              onChange={(e) => setLibrary(e.target.value)}
            />
            {errors.library && (
              <p className="text-xs text-destructive">{errors.library}</p>
            )}
          </div>
          <div className="space-y-1">
            <label htmlFor="version" className="text-xs font-mono text-muted-foreground">
              version *
            </label>
            <Input
              id="version"
              placeholder="e.g. 19.0.0"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
            {errors.version && (
              <p className="text-xs text-destructive">{errors.version}</p>
            )}
          </div>
        </div>

        {/* Error Message */}
        <div className="space-y-1">
          <label htmlFor="errorMessage" className="text-xs font-mono text-muted-foreground">
            error message
          </label>
          <Input
            id="errorMessage"
            placeholder="e.g. TypeError: Cannot read properties of undefined"
            value={errorMessage}
            onChange={(e) => setErrorMessage(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground font-mono">
            at least one of error message or description is required
          </p>
          {errors.errorMessage && (
            <p className="text-xs text-destructive">{errors.errorMessage}</p>
          )}
        </div>

        {/* Error Code */}
        <div className="space-y-1">
          <label htmlFor="errorCode" className="text-xs font-mono text-muted-foreground">
            error code
          </label>
          <Input
            id="errorCode"
            placeholder="e.g. ERR_MODULE_NOT_FOUND"
            value={errorCode}
            onChange={(e) => setErrorCode(e.target.value)}
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label htmlFor="description" className="text-xs font-mono text-muted-foreground">
            description
          </label>
          <Textarea
            id="description"
            placeholder="Describe the bug in detail..."
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {errors.description && (
            <p className="text-xs text-destructive">{errors.description}</p>
          )}
        </div>

        {/* Title (optional) */}
        <div className="space-y-1">
          <label htmlFor="title" className="text-xs font-mono text-muted-foreground">
            title (optional)
          </label>
          <Input
            id="title"
            placeholder="Short summary — auto-generated from error message if omitted"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Trigger Code */}
        <div className="space-y-1">
          <label htmlFor="triggerCode" className="text-xs font-mono text-muted-foreground">
            trigger code
          </label>
          <Textarea
            id="triggerCode"
            placeholder="Minimal code snippet that triggers the bug..."
            rows={4}
            className="font-mono text-sm"
            value={triggerCode}
            onChange={(e) => setTriggerCode(e.target.value)}
          />
        </div>

        {/* Expected vs Actual */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="expectedBehavior" className="text-xs font-mono text-muted-foreground">
              expected behavior
            </label>
            <Textarea
              id="expectedBehavior"
              placeholder="What should happen..."
              rows={3}
              value={expectedBehavior}
              onChange={(e) => setExpectedBehavior(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="actualBehavior" className="text-xs font-mono text-muted-foreground">
              actual behavior
            </label>
            <Textarea
              id="actualBehavior"
              placeholder="What actually happens..."
              rows={3}
              value={actualBehavior}
              onChange={(e) => setActualBehavior(e.target.value)}
            />
          </div>
        </div>

        {/* Stack Trace */}
        <div className="space-y-1">
          <label htmlFor="stackTrace" className="text-xs font-mono text-muted-foreground">
            stack trace
          </label>
          <Textarea
            id="stackTrace"
            placeholder="Full stack trace..."
            rows={4}
            className="font-mono text-xs"
            value={stackTrace}
            onChange={(e) => setStackTrace(e.target.value)}
          />
        </div>

        {/* Ecosystem + Severity */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground">ecosystem *</label>
            <Select value={ecosystem} onValueChange={setEcosystem}>
              <SelectTrigger>
                <SelectValue placeholder="select ecosystem" />
              </SelectTrigger>
              <SelectContent>
                {ecosystems.map((eco) => (
                  <SelectItem key={eco} value={eco}>
                    {eco}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.ecosystem && (
              <p className="text-xs text-destructive">{errors.ecosystem}</p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-mono text-muted-foreground">severity</label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue placeholder="select severity" />
              </SelectTrigger>
              <SelectContent>
                {severities.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-1">
          <label htmlFor="tags" className="text-xs font-mono text-muted-foreground">
            tags
          </label>
          <Input
            id="tags"
            placeholder="comma-separated, e.g. memory-leak, hooks, useEffect"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground font-mono">
            separate tags with commas
          </p>
        </div>

        {/* Inline Patch (optional) */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includePatch}
              onChange={(e) => setIncludePatch(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-xs font-mono text-muted-foreground">
              include a fix (+5 bonus credits)
            </span>
          </label>
          {includePatch && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="space-y-1">
                <label className="text-xs font-mono text-muted-foreground">
                  explanation
                </label>
                <Textarea
                  placeholder="What this patch changes and why it fixes the bug..."
                  rows={2}
                  value={patchExplanation}
                  onChange={(e) => setPatchExplanation(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-mono text-muted-foreground">
                  code
                </label>
                <Textarea
                  placeholder="Paste your fix code..."
                  rows={6}
                  className="font-mono text-sm"
                  value={patchCode}
                  onChange={(e) => setPatchCode(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-muted-foreground font-mono">
            {"\u2318"}+enter to submit
          </span>
          <Button type="submit" size="sm" disabled={isSubmitting} className="font-mono">
            {isSubmitting ? "submitting..." : "report bug"}
          </Button>
        </div>
      </form>
    </div>
  );
}
