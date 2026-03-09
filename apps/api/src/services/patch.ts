import { prisma } from "@knownissue/db";
import { PATCH_REWARD } from "@knownissue/shared";
import type { PatchStep } from "@knownissue/shared";
import { awardCredits, getCredits } from "./credits";
import { logAudit } from "./audit";
import { computeDerivedStatus } from "./issue";
import { claimReportReward } from "./reward";
import { createRelation, loadRelatedIssues } from "./relations";
import { inferRelationsForPatch } from "./relationInference";
import { RELATION_DISPLAY_CONFIDENCE_MIN, RELATION_MAX_DISPLAYED_PER_BUG } from "@knownissue/shared";

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
        steps: steps as unknown as import("@knownissue/db").Prisma.InputJsonValue,
        versionConstraint: versionConstraint ?? null,
      },
      include: {
        submitter: true,
        issue: { select: { title: true } },
      },
    });

    await logAudit({
      action: "update",
      entityType: "patch",
      entityId: updated.id,
      actorId: userId,
      metadata: { issueId },
    });

    return { ...updated, creditsAwarded: 0, creditsBalance: await getCredits(userId), updated: true };
  }

  // Create new patch
  const patch = await prisma.patch.create({
    data: {
      explanation,
      steps: steps as unknown as import("@knownissue/db").Prisma.InputJsonValue,
      versionConstraint: versionConstraint ?? null,
      issueId,
      submitterId: userId,
    },
    include: {
      submitter: true,
      issue: { select: { title: true } },
    },
  });

  const newBalance = await awardCredits(userId, PATCH_REWARD, "patch_submitted", {
    issueId,
    patchId: patch.id,
  });

  await logAudit({
    action: "create",
    entityType: "patch",
    entityId: patch.id,
    actorId: userId,
    metadata: { issueId },
  });

  // Recompute derived status after new patch
  await computeDerivedStatus(issueId);

  // Claim deferred report reward if this is from a different user
  await claimReportReward(issueId, userId);

  // Handle explicit relation from agent
  if (relatedTo) {
    await createRelation({
      sourceIssueId: issueId,
      targetIssueId: relatedTo.issueId,
      type: relatedTo.type,
      source: "agent",
      confidence: 1.0,
      metadata: relatedTo.note ? { note: relatedTo.note } : undefined,
      createdById: userId,
    });
  }

  // Run relation inference (fire-and-forget)
  inferRelationsForPatch(patch.id, issueId).catch((err) =>
    console.error("Relation inference failed for patch", patch.id, err)
  );

  return { ...patch, creditsAwarded: PATCH_REWARD, creditsBalance: newBalance, updated: false };
}

export async function getPatchById(id: string) {
  return prisma.patch.findUnique({
    where: { id },
    include: {
      submitter: true,
      issue: { select: { id: true, title: true } },
      verifications: {
        include: { verifier: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function getPatchForAgent(patchId: string, userId: string) {
  const patch = await prisma.patch.findUnique({
    where: { id: patchId },
    include: {
      submitter: true,
      issue: { select: { id: true, title: true, library: true, version: true } },
      verifications: {
        include: { verifier: true },
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
    await computeDerivedStatus(patch.issueId);

    // Trigger deferred report reward
    await claimReportReward(patch.issueId, userId);
  } catch {
    // Unique constraint violation — access already recorded, do nothing
  }

  const relatedMap = await loadRelatedIssues([patch.issueId], {
    minConfidence: RELATION_DISPLAY_CONFIDENCE_MIN,
    maxPerBug: RELATION_MAX_DISPLAYED_PER_BUG,
  });

  return {
    ...patch,
    relatedIssues: relatedMap.get(patch.issueId) ?? [],
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
