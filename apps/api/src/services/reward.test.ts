import { describe, it, expect, vi, beforeEach } from "vitest";
import { REPORT_DEFERRED_REWARD } from "@knownissue/shared";

vi.mock("@knownissue/db", () => ({
  prisma: {
    issue: {
      findUnique: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
  },
}));

vi.mock("./credits", () => ({
  awardCredits: vi.fn(),
}));

import { prisma } from "@knownissue/db";
import { awardCredits } from "./credits";
import { claimReportReward } from "./reward";

const mockFindUnique = prisma.issue.findUnique as ReturnType<typeof vi.fn>;
const mockExecuteRaw = prisma.$executeRawUnsafe as ReturnType<typeof vi.fn>;
const mockAwardCredits = awardCredits as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claimReportReward", () => {
  it("awards deferred reward when conditions are met", async () => {
    mockFindUnique.mockResolvedValue({
      reporterId: "reporter-1",
      rewardClaimed: false,
    });
    mockExecuteRaw.mockResolvedValue(1);
    mockAwardCredits.mockResolvedValue(7);

    await claimReportReward("issue-1", "trigger-user");

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "issue-1" },
      select: { reporterId: true, rewardClaimed: true },
    });
    expect(mockExecuteRaw).toHaveBeenCalledWith(
      `UPDATE "Bug" SET "rewardClaimed" = true WHERE id = $1 AND "rewardClaimed" = false`,
      "issue-1"
    );
    expect(mockAwardCredits).toHaveBeenCalledWith(
      "reporter-1",
      REPORT_DEFERRED_REWARD,
      "issue_reported_deferred",
      { issueId: "issue-1" }
    );
  });

  it("is a no-op when issue is not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    await claimReportReward("nonexistent", "trigger-user");

    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(mockAwardCredits).not.toHaveBeenCalled();
  });

  it("is a no-op when rewardClaimed is already true", async () => {
    mockFindUnique.mockResolvedValue({
      reporterId: "reporter-1",
      rewardClaimed: true,
    });

    await claimReportReward("issue-1", "trigger-user");

    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(mockAwardCredits).not.toHaveBeenCalled();
  });

  it("is a no-op when triggerUserId is the reporter (same user)", async () => {
    mockFindUnique.mockResolvedValue({
      reporterId: "same-user",
      rewardClaimed: false,
    });

    await claimReportReward("issue-1", "same-user");

    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(mockAwardCredits).not.toHaveBeenCalled();
  });

  it("does not award credits when atomic update returns 0 (race condition)", async () => {
    mockFindUnique.mockResolvedValue({
      reporterId: "reporter-1",
      rewardClaimed: false,
    });
    // Another concurrent request already claimed it
    mockExecuteRaw.mockResolvedValue(0);

    await claimReportReward("issue-1", "trigger-user");

    expect(mockExecuteRaw).toHaveBeenCalled();
    expect(mockAwardCredits).not.toHaveBeenCalled();
  });

  it("awards the correct deferred amount (REPORT_DEFERRED_REWARD = 2)", async () => {
    mockFindUnique.mockResolvedValue({
      reporterId: "reporter-1",
      rewardClaimed: false,
    });
    mockExecuteRaw.mockResolvedValue(1);
    mockAwardCredits.mockResolvedValue(7);

    await claimReportReward("issue-1", "other-user");

    expect(mockAwardCredits).toHaveBeenCalledWith(
      "reporter-1",
      2, // REPORT_DEFERRED_REWARD
      "issue_reported_deferred",
      { issueId: "issue-1" }
    );
  });

  it("awards to the reporter, not the trigger user", async () => {
    mockFindUnique.mockResolvedValue({
      reporterId: "the-reporter",
      rewardClaimed: false,
    });
    mockExecuteRaw.mockResolvedValue(1);
    mockAwardCredits.mockResolvedValue(7);

    await claimReportReward("issue-1", "the-trigger");

    // First argument to awardCredits should be the reporter
    expect(mockAwardCredits).toHaveBeenCalledWith(
      "the-reporter",
      expect.any(Number),
      expect.any(String),
      expect.any(Object)
    );
  });
});
