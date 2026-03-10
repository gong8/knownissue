import { prisma, Prisma } from "@knownissue/db";
import { PATCH_REWARD } from "@knownissue/shared";
import type { PatchStep } from "@knownissue/shared";
import { awardCredits, getCredits } from "./credits";
import { logAudit } from "./audit";
import { computeDerivedStatus } from "./issue";
import { claimReportReward } from "./reward";
import { createRelation, loadRelatedIssues } from "./relations";
import { inferRelationsForPatch } from "./relationInference";
import { RELATION_DISPLAY_CONFIDENCE_MIN, RELATION_MAX_DISPLAYED_PER_ISSUE } from "@knownissue/shared";

export async function submitPatch(
  issueId: string,
  explanation: string,
  steps: PatchStep[],
  versionConstraint: string | null | undefined,
  userId: string,
  relatedTo?: { issueId: string; type: "shared_fix" | "fix_conflict"; note?: string }
) {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  if (!issue) {
    throw new Error("Issue not found");
  }

  // Check if this user already has a patch on this issue
  const existing = await prisma.patch.findUnique({
    where: { issueId_submitterId: { issueId, submitterId: userId } },
  });

  if (existing) {
    // Update existing patch — no credits awarded
    const updated = await prisma.patch.update({
      where: { id: existing.id },
      data: {
        explanation,
        steps: steps as unknown as Prisma.InputJsonValue,
        versionConstraint: versionConstraint ?? null,
      },
      include: {
        submitter: { select: { id: true, displayName: true, avatarUrl: true } },
        issue: { select: { title: true } },
      },
    });

    logAudit({
      action: "update",
      entityType: "patch",
      entityId: updated.id,
      actorId: userId,
      metadata: { issueId },
    }).catch((err) => console.error("Failed to log patch audit:", err));

    // Recompute derived status (idempotent, cheap)
    computeDerivedStatus(issueId).catch((err) => console.error("Failed to recompute derived status:", err));

    const _warnings: string[] = [];
    if (relatedTo) {
      const created = await createRelation({
        sourceIssueId: issueId,
        targetIssueId: relatedTo.issueId,
        type: relatedTo.type,
        source: "agent",
        confidence: 1.0,
        metadata: relatedTo.note ? { note: relatedTo.note } : undefined,
        createdById: userId,
      });
      if (!created) {
        _warnings.push("Relation was not created — target issue may not exist or relation already exists");
      }
    }

    return {
      ...updated,
      creditsAwarded: 0,
      creditsBalance: await getCredits(userId),
      updated: true,
      ...(_warnings.length > 0 && { _warnings }),
      _next_actions: ["Your patch has been updated — previous verifications still apply"],
    };
  }

  // Create new patch
  let patch;
  try {
    patch = await prisma.patch.create({
      data: {
        explanation,
        steps: steps as unknown as Prisma.InputJsonValue,
        versionConstraint: versionConstraint ?? null,
        issueId,
        submitterId: userId,
      },
      include: {
        submitter: { select: { id: true, displayName: true, avatarUrl: true } },
        issue: { select: { title: true } },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("You have already submitted a patch for this issue");
    }
    throw error;
  }

  const newBalance = await awardCredits(userId, PATCH_REWARD, "patch_submitted", {
    issueId,
    patchId: patch.id,
  });

  logAudit({
    action: "create",
    entityType: "patch",
    entityId: patch.id,
    actorId: userId,
    metadata: { issueId },
  }).catch((err) => console.error("Failed to log patch audit:", err));

  // Recompute derived status after new patch
  computeDerivedStatus(issueId).catch((err) => console.error("Failed to recompute derived status:", err));

  // Claim deferred report reward if this is from a different user
  claimReportReward(issueId, userId).catch((err) => console.error("Failed to claim report reward:", err));

  // Handle explicit relation from agent
  const _warnings: string[] = [];
  if (relatedTo) {
    const created = await createRelation({
      sourceIssueId: issueId,
      targetIssueId: relatedTo.issueId,
      type: relatedTo.type,
      source: "agent",
      confidence: 1.0,
      metadata: relatedTo.note ? { note: relatedTo.note } : undefined,
      createdById: userId,
    });
    if (!created) {
      _warnings.push("Relation was not created — target issue may not exist or relation already exists");
    }
  }

  // Run relation inference (fire-and-forget)
  inferRelationsForPatch(patch.id, issueId).catch((err) =>
    console.error("Relation inference failed for patch", patch.id, err)
  );

  return {
    ...patch,
    creditsAwarded: PATCH_REWARD,
    creditsBalance: newBalance,
    updated: false,
    ...(_warnings.length > 0 && { _warnings }),
    _next_actions: [
      "Your patch is live — other agents can now find and verify it",
      "Check my_activity later to see if verifications come in",
    ],
  };
}

export async function getPatchById(id: string) {
  const patch = await prisma.patch.findUnique({
    where: { id },
    include: {
      submitter: { select: { id: true, displayName: true, avatarUrl: true } },
      issue: { select: { id: true, title: true, library: true, version: true } },
      verifications: {
        include: { verifier: { select: { id: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!patch) return null;

  // Load related issues for the parent issue
  const relatedMap = await loadRelatedIssues([patch.issueId], {
    minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN,
    maxPerIssue: RELATION_MAX_DISPLAYED_PER_ISSUE,
  });

  return {
    ...patch,
    issue: patch.issue ? { ...patch.issue, relatedIssues: relatedMap.get(patch.issueId) ?? [] } : patch.issue,
  };
}

export async function getPatchForAgent(patchId: string, userId: string) {
  const patch = await prisma.patch.findUnique({
    where: { id: patchId },
    include: {
      submitter: { select: { id: true, displayName: true, avatarUrl: true } },
      issue: { select: { id: true, title: true, library: true, version: true } },
      verifications: {
        include: { verifier: { select: { id: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!patch) {
    throw new Error("Patch not found");
  }

  // Idempotent: try to create PatchAccess, ignore if already exists
  try {
    await prisma.$transaction(async (tx) => {
      await tx.patchAccess.create({
        data: { patchId, userId },
      });

      // Increment accessCount on the issue
      await tx.issue.update({
        where: { id: patch.issueId },
        data: { accessCount: { increment: 1 } },
      });
    });

    // Recompute derived status after accessCount change
    computeDerivedStatus(patch.issueId).catch((err) => console.error("Failed to recompute derived status:", err));

    // Trigger deferred report reward
    claimReportReward(patch.issueId, userId).catch((err) => console.error("Failed to claim report reward:", err));
  } catch (error) {
    // Only swallow unique constraint violations (expected for idempotent access tracking)
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      throw error;
    }
  }

  const relatedMap = await loadRelatedIssues([patch.issueId], {
    minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN,
    maxPerIssue: RELATION_MAX_DISPLAYED_PER_ISSUE,
  });

  return {
    ...patch,
    relatedIssues: relatedMap.get(patch.issueId) ?? [],
    _next_actions: [
      "Apply this patch, then call verify with the outcome",
      "If the patch needs improvement, call patch to submit your own fix",
    ],
  };
}

export async function getUserPatches(userId: string) {
  return prisma.patch.findMany({
    where: { submitterId: userId },
    include: {
      issue: { select: { id: true, title: true } },
      _count: { select: { verifications: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
