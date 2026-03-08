"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { bugInputSchema } from "@knownissue/shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [library, setLibrary] = useState("");
  const [version, setVersion] = useState("");
  const [ecosystem, setEcosystem] = useState("");
  const [severity, setSeverity] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const result = bugInputSchema.safeParse({
      title,
      description,
      library,
      version,
      ecosystem,
      severity,
      tags,
    });

    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString();
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const { createBug } = await import("@/app/actions/bugs");
      await createBug(result.data);
      toast.success("Bug reported successfully!", {
        description: "Your bug report has been submitted for review.",
      });
      setTitle("");
      setDescription("");
      setLibrary("");
      setVersion("");
      setEcosystem("");
      setSeverity("");
      setTagsInput("");
    } catch {
      toast.error("Failed to submit bug report", {
        description: "The API server may be unavailable. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back link */}
      <Link
        href="/bugs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to bugs
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Report a Bug</CardTitle>
          <CardDescription>
            Document a bug you encountered in an open-source library so others
            (and their agents) can find solutions faster.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Title */}
            <div className="space-y-1.5">
              <label
                htmlFor="title"
                className="text-sm font-medium"
              >
                Title
              </label>
              <Input
                id="title"
                placeholder="e.g. Memory leak in useEffect cleanup with React 19"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label
                htmlFor="description"
                className="text-sm font-medium"
              >
                Description
              </label>
              <Textarea
                id="description"
                placeholder="Describe the bug in detail: what happens, reproduction steps, expected vs. actual behavior..."
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description}</p>
              )}
            </div>

            {/* Library + Version (side by side) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="library"
                  className="text-sm font-medium"
                >
                  Library
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
              <div className="space-y-1.5">
                <label
                  htmlFor="version"
                  className="text-sm font-medium"
                >
                  Version
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

            {/* Ecosystem + Severity (side by side) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Ecosystem</label>
                <Select value={ecosystem} onValueChange={setEcosystem}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ecosystem" />
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
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Severity</label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select severity" />
                  </SelectTrigger>
                  <SelectContent>
                    {severities.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.severity && (
                  <p className="text-xs text-destructive">{errors.severity}</p>
                )}
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <label
                htmlFor="tags"
                className="text-sm font-medium"
              >
                Tags
              </label>
              <Input
                id="tags"
                placeholder="comma-separated, e.g. memory-leak, hooks, useEffect"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Separate tags with commas
              </p>
              {errors.tags && (
                <p className="text-xs text-destructive">{errors.tags}</p>
              )}
            </div>

            {/* Submit */}
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Report Bug"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
