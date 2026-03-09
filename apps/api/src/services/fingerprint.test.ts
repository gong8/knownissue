import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

vi.mock("@knownissue/db", () => ({
  prisma: {
    issue: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@knownissue/db";
import {
  computeFingerprint,
  normalizeErrorMessage,
  findByFingerprint,
} from "./fingerprint";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computeFingerprint", () => {
  it("returns null when library is not provided", () => {
    expect(computeFingerprint(undefined, "E001", "some error")).toBeNull();
  });

  it("returns null when library is null", () => {
    expect(computeFingerprint(null, "E001", "some error")).toBeNull();
  });

  it("returns null when library is empty string", () => {
    expect(computeFingerprint("", "E001", "some error")).toBeNull();
  });

  it("returns sha256(library::errorCode) when errorCode is present", () => {
    const result = computeFingerprint("react", "E001", "some error");
    expect(result).toBe(sha256("react::E001"));
  });

  it("prefers errorCode over errorMessage when both present", () => {
    const result = computeFingerprint("react", "E001", "Module not found");
    expect(result).toBe(sha256("react::E001"));
  });

  it("returns sha256(library::normalized(errorMessage)) when errorCode absent", () => {
    const msg = "Cannot read property of undefined";
    const normalized = normalizeErrorMessage(msg);
    const result = computeFingerprint("react", null, msg);
    expect(result).toBe(sha256(`react::${normalized}`));
  });

  it("returns sha256(library::normalized(errorMessage)) when errorCode undefined", () => {
    const msg = "File not found at /usr/local/lib/node";
    const normalized = normalizeErrorMessage(msg);
    const result = computeFingerprint("webpack", undefined, msg);
    expect(result).toBe(sha256(`webpack::${normalized}`));
  });

  it("returns null when library present but no errorCode and no errorMessage", () => {
    expect(computeFingerprint("react")).toBeNull();
  });

  it("returns null when library present with null errorCode and null errorMessage", () => {
    expect(computeFingerprint("react", null, null)).toBeNull();
  });

  it("returns null when library present with empty errorCode and empty errorMessage", () => {
    // empty strings are falsy, so should return null
    expect(computeFingerprint("react", "", "")).toBeNull();
  });

  it("produces different hashes for different libraries same errorCode", () => {
    const a = computeFingerprint("react", "E001");
    const b = computeFingerprint("vue", "E001");
    expect(a).not.toBe(b);
  });

  it("produces deterministic results", () => {
    const a = computeFingerprint("react", "E001");
    const b = computeFingerprint("react", "E001");
    expect(a).toBe(b);
  });
});

describe("normalizeErrorMessage", () => {
  it("strips Unix file paths", () => {
    const result = normalizeErrorMessage(
      "Error in /usr/local/lib/node_modules/react"
    );
    expect(result).not.toContain("/usr/local/lib");
    expect(result).toContain("<path>");
  });

  it("strips Windows file paths", () => {
    const result = normalizeErrorMessage(
      "Error in C:\\Users\\dev\\project\\src\\index.ts"
    );
    expect(result).not.toContain("C:\\Users");
    expect(result).toContain("<path>");
  });

  it("strips line:col patterns", () => {
    const result = normalizeErrorMessage("Error at line 42:13 in file");
    expect(result).not.toContain("42:13");
    expect(result).toContain("<line>:<col>");
  });

  it("strips UUIDs (lowercase)", () => {
    const result = normalizeErrorMessage(
      "Request 550e8400-e29b-41d4-a716-446655440000 failed"
    );
    expect(result).not.toContain("550e8400");
    expect(result).toContain("<uuid>");
  });

  it("strips UUIDs (uppercase)", () => {
    const result = normalizeErrorMessage(
      "ID: 550E8400-E29B-41D4-A716-446655440000"
    );
    expect(result).toContain("<uuid>");
  });

  it("strips hex strings (0x prefix, 8+ chars)", () => {
    const result = normalizeErrorMessage("Segfault at 0x1234abcd5678");
    expect(result).not.toContain("0x1234abcd5678");
    expect(result).toContain("<hex>");
  });

  it("does not strip short hex strings", () => {
    // 0x1234 is only 4 hex chars, below the 8-char minimum
    const result = normalizeErrorMessage("Value 0x1234 ok");
    expect(result).toContain("0x1234");
  });

  it("strips long numbers (4+ digits)", () => {
    const result = normalizeErrorMessage("Error code 12345 at timestamp 9999");
    expect(result).not.toContain("12345");
    expect(result).not.toContain("9999");
    expect(result).toContain("<num>");
  });

  it("preserves short numbers (< 4 digits)", () => {
    const result = normalizeErrorMessage("Error 404 occurred 3 times");
    expect(result).toContain("404");
    expect(result).toContain("3");
  });

  it("collapses whitespace", () => {
    const result = normalizeErrorMessage("error    in    module");
    expect(result).toBe("error in module");
  });

  it("trims leading and trailing whitespace", () => {
    const result = normalizeErrorMessage("  error  ");
    expect(result).toBe("error");
  });

  it("lowercases everything", () => {
    const result = normalizeErrorMessage("Cannot Read Property Of UNDEFINED");
    expect(result).toBe("cannot read property of undefined");
  });

  it("handles multiple transformations together", () => {
    const result = normalizeErrorMessage(
      "Error at /usr/lib/node:42:13 UUID 550e8400-e29b-41d4-a716-446655440000 code 12345"
    );
    expect(result).toContain("<path>");
    expect(result).toContain("<line>:<col>");
    expect(result).toContain("<uuid>");
    expect(result).toContain("<num>");
  });

  it("produces same output for messages differing only in paths", () => {
    const a = normalizeErrorMessage("Error in /home/user1/project/src/file.ts");
    const b = normalizeErrorMessage("Error in /home/user2/other/src/file.ts");
    expect(a).toBe(b);
  });

  it("produces same output for messages differing only in line numbers", () => {
    const a = normalizeErrorMessage("Error at 10:5 in module");
    const b = normalizeErrorMessage("Error at 200:15 in module");
    expect(a).toBe(b);
  });

  it("handles empty string", () => {
    expect(normalizeErrorMessage("")).toBe("");
  });

  it("handles string with only whitespace", () => {
    expect(normalizeErrorMessage("   ")).toBe("");
  });
});

describe("findByFingerprint", () => {
  const mockFindFirst = prisma.issue.findFirst as ReturnType<typeof vi.fn>;

  it("queries prisma with the correct fingerprint and includes", async () => {
    mockFindFirst.mockResolvedValue(null);

    await findByFingerprint("abc123");

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { fingerprint: "abc123" },
      include: {
        reporter: true,
        patches: {
          include: {
            submitter: true,
            verifications: { include: { verifier: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  });

  it("returns the found issue", async () => {
    const mockIssue = {
      id: "issue-1",
      fingerprint: "abc123",
      reporter: { id: "user-1" },
      patches: [],
    };
    mockFindFirst.mockResolvedValue(mockIssue);

    const result = await findByFingerprint("abc123");
    expect(result).toEqual(mockIssue);
  });

  it("returns null when no issue matches", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await findByFingerprint("nonexistent");
    expect(result).toBeNull();
  });
});
