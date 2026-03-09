import { describe, it, expect, vi, beforeEach } from "vitest";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Mock all service dependencies before importing server
vi.mock("../services/issue", () => ({
  searchIssues: vi.fn(),
  createIssue: vi.fn(),
}));
vi.mock("../services/patch", () => ({
  getPatchForAgent: vi.fn(),
  submitPatch: vi.fn(),
}));
vi.mock("../services/verification", () => ({
  verify: vi.fn(),
}));
vi.mock("../services/activity", () => ({
  getMyActivity: vi.fn(),
}));
vi.mock("../services/credits", () => ({
  deductCredits: vi.fn(),
  getCredits: vi.fn().mockResolvedValue(10),
}));

import { createMcpServer } from "./server";
import * as issueService from "../services/issue";
import * as patchService from "../services/patch";
import * as verificationService from "../services/verification";
import * as activityService from "../services/activity";
import { deductCredits, getCredits } from "../services/credits";

const TEST_USER_ID = "user-test-123";

async function createTestClient(userId: string = TEST_USER_ID) {
  const server = createMcpServer(userId);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  return { client, server };
}

function parseToolResult(result: { content: Array<{ type: string; text?: string }> }) {
  const textContent = result.content.find((c) => c.type === "text");
  return textContent?.text ? JSON.parse(textContent.text) : null;
}

describe("MCP Server", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCredits).mockResolvedValue(10);
  });

  describe("tool listing", () => {
    it("lists all 5 tools with correct names", async () => {
      const { client, server } = await createTestClient();

      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();

      expect(names).toEqual([
        "my_activity",
        "patch",
        "report",
        "search",
        "verify",
      ]);

      await server.close();
    });
  });

  describe("search tool", () => {
    it("calls getPatchForAgent when patchId is provided (free)", async () => {
      const mockPatch = { id: "patch-1", explanation: "Fix the thing" };
      vi.mocked(patchService.getPatchForAgent).mockResolvedValue(mockPatch);

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "search",
        arguments: { patchId: "550e8400-e29b-41d4-a716-446655440000" },
      });

      expect(patchService.getPatchForAgent).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440000",
        TEST_USER_ID
      );
      // patchId lookup is free — deductCredits should NOT be called
      expect(deductCredits).not.toHaveBeenCalled();

      const parsed = parseToolResult(result);
      expect(parsed.id).toBe("patch-1");

      await server.close();
    });

    it("calls deductCredits then searchIssues when query is provided", async () => {
      const mockResults = { issues: [{ id: "issue-1" }], total: 1 };
      vi.mocked(issueService.searchIssues).mockResolvedValue(mockResults);

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "search",
        arguments: { query: "lodash merge crash" },
      });

      expect(deductCredits).toHaveBeenCalledWith(TEST_USER_ID, 1, "search");
      expect(issueService.searchIssues).toHaveBeenCalledWith(
        expect.objectContaining({ query: "lodash merge crash" }),
        TEST_USER_ID
      );

      const parsed = parseToolResult(result);
      expect(parsed.issues).toHaveLength(1);

      await server.close();
    });

    it("returns error when neither query nor patchId is provided", async () => {
      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "search",
        arguments: {},
      });

      const parsed = parseToolResult(result);
      expect(parsed.error).toContain("query is required");
      expect(result.isError).toBe(true);

      await server.close();
    });

    it("passes filter params to searchIssues", async () => {
      vi.mocked(issueService.searchIssues).mockResolvedValue({ issues: [], total: 0 });

      const { client, server } = await createTestClient();

      await client.callTool({
        name: "search",
        arguments: {
          query: "crash",
          library: "react",
          version: "18.2.0",
          errorCode: "ERR_001",
          contextLibrary: "webpack",
        },
      });

      expect(issueService.searchIssues).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "crash",
          library: "react",
          version: "18.2.0",
          errorCode: "ERR_001",
          contextLibrary: "webpack",
        }),
        TEST_USER_ID
      );

      await server.close();
    });
  });

  describe("report tool", () => {
    it("calls createIssue and returns result with credits_remaining", async () => {
      const mockIssue = { id: "issue-new", title: "Bug report" };
      vi.mocked(issueService.createIssue).mockResolvedValue(mockIssue);

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "report",
        arguments: {
          errorMessage: "TypeError: Cannot read properties of undefined",
          library: "lodash",
          version: "4.17.21",
        },
      });

      expect(issueService.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: "TypeError: Cannot read properties of undefined",
          library: "lodash",
          version: "4.17.21",
        }),
        TEST_USER_ID
      );

      const parsed = parseToolResult(result);
      expect(parsed.id).toBe("issue-new");
      expect(result._meta?.credits_remaining).toBe(10);

      await server.close();
    });

    it("supports inline patch in report", async () => {
      const mockResult = { id: "issue-new", patchId: "patch-inline" };
      vi.mocked(issueService.createIssue).mockResolvedValue(mockResult);

      const { client, server } = await createTestClient();

      await client.callTool({
        name: "report",
        arguments: {
          errorMessage: "Module not found",
          patch: {
            explanation: "Install the missing dependency to fix it",
            steps: [{ type: "command", command: "npm install missing-dep" }],
          },
        },
      });

      expect(issueService.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: "Module not found",
          patch: expect.objectContaining({
            explanation: "Install the missing dependency to fix it",
          }),
        }),
        TEST_USER_ID
      );

      await server.close();
    });
  });

  describe("patch tool", () => {
    it("calls submitPatch with all params", async () => {
      const mockPatch = { id: "patch-1", explanation: "Fix it" };
      vi.mocked(patchService.submitPatch).mockResolvedValue(mockPatch);

      const { client, server } = await createTestClient();

      const issueId = "550e8400-e29b-41d4-a716-446655440000";
      const result = await client.callTool({
        name: "patch",
        arguments: {
          issueId,
          explanation: "Change the import path to fix the build",
          steps: [
            {
              type: "code_change",
              filePath: "src/index.ts",
              before: 'import foo from "bar"',
              after: 'import foo from "baz"',
            },
          ],
          versionConstraint: ">=1.0.0 <2.0.0",
        },
      });

      expect(patchService.submitPatch).toHaveBeenCalledWith(
        issueId,
        "Change the import path to fix the build",
        [
          {
            type: "code_change",
            filePath: "src/index.ts",
            before: 'import foo from "bar"',
            after: 'import foo from "baz"',
          },
        ],
        ">=1.0.0 <2.0.0",
        TEST_USER_ID,
        undefined
      );

      const parsed = parseToolResult(result);
      expect(parsed.id).toBe("patch-1");

      await server.close();
    });

    it("passes relatedTo when provided", async () => {
      vi.mocked(patchService.submitPatch).mockResolvedValue({ id: "patch-2" });

      const { client, server } = await createTestClient();

      const issueId = "550e8400-e29b-41d4-a716-446655440000";
      const relatedIssueId = "660e8400-e29b-41d4-a716-446655440000";

      await client.callTool({
        name: "patch",
        arguments: {
          issueId,
          explanation: "Apply shared fix across issues",
          steps: [{ type: "instruction", text: "Do the thing" }],
          relatedTo: {
            issueId: relatedIssueId,
            type: "shared_fix",
            note: "Same root cause",
          },
        },
      });

      expect(patchService.submitPatch).toHaveBeenCalledWith(
        issueId,
        "Apply shared fix across issues",
        [{ type: "instruction", text: "Do the thing" }],
        undefined,
        TEST_USER_ID,
        { issueId: relatedIssueId, type: "shared_fix", note: "Same root cause" }
      );

      await server.close();
    });
  });

  describe("verify tool", () => {
    it("calls verify with all params", async () => {
      const mockResult = { id: "ver-1", outcome: "fixed" };
      vi.mocked(verificationService.verify).mockResolvedValue(mockResult);

      const { client, server } = await createTestClient();

      const patchId = "550e8400-e29b-41d4-a716-446655440000";
      const result = await client.callTool({
        name: "verify",
        arguments: {
          patchId,
          outcome: "fixed",
          note: "Works perfectly",
          errorBefore: "TypeError: boom",
          testedVersion: "4.17.22",
          issueAccuracy: "accurate",
        },
      });

      expect(verificationService.verify).toHaveBeenCalledWith(
        patchId,
        "fixed",
        "Works perfectly",
        "TypeError: boom",
        undefined,
        "4.17.22",
        "accurate",
        TEST_USER_ID
      );

      const parsed = parseToolResult(result);
      expect(parsed.outcome).toBe("fixed");

      await server.close();
    });

    it("handles not_fixed outcome", async () => {
      const mockResult = { id: "ver-2", outcome: "not_fixed" };
      vi.mocked(verificationService.verify).mockResolvedValue(mockResult);

      const { client, server } = await createTestClient();

      const patchId = "550e8400-e29b-41d4-a716-446655440000";
      await client.callTool({
        name: "verify",
        arguments: {
          patchId,
          outcome: "not_fixed",
          note: "Still crashes",
          errorBefore: "TypeError: boom",
          errorAfter: "TypeError: boom",
        },
      });

      expect(verificationService.verify).toHaveBeenCalledWith(
        patchId,
        "not_fixed",
        "Still crashes",
        "TypeError: boom",
        "TypeError: boom",
        undefined,
        undefined,
        TEST_USER_ID
      );

      await server.close();
    });
  });

  describe("my_activity tool", () => {
    it("calls getMyActivity with filters", async () => {
      const mockActivity = {
        summary: { issues: 5, patches: 3, verifications: 2, credits: 10 },
        recent: [],
        actionable: [],
      };
      vi.mocked(activityService.getMyActivity).mockResolvedValue(mockActivity);

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "my_activity",
        arguments: { type: "patches", limit: 5 },
      });

      expect(activityService.getMyActivity).toHaveBeenCalledWith(
        TEST_USER_ID,
        { type: "patches", outcome: undefined, limit: 5 }
      );

      const parsed = parseToolResult(result);
      expect(parsed.summary.credits).toBe(10);

      await server.close();
    });

    it("calls getMyActivity with no filters when none provided", async () => {
      vi.mocked(activityService.getMyActivity).mockResolvedValue({
        summary: { issues: 0, patches: 0, verifications: 0, credits: 5 },
        recent: [],
        actionable: [],
      });

      const { client, server } = await createTestClient();

      await client.callTool({
        name: "my_activity",
        arguments: {},
      });

      expect(activityService.getMyActivity).toHaveBeenCalledWith(
        TEST_USER_ID,
        { type: undefined, outcome: undefined, limit: undefined }
      );

      await server.close();
    });
  });

  describe("error handling", () => {
    it("returns isError with message when service throws", async () => {
      vi.mocked(issueService.searchIssues).mockRejectedValue(
        new Error("Something went wrong")
      );

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "search",
        arguments: { query: "crash" },
      });

      expect(result.isError).toBe(true);
      const parsed = parseToolResult(result);
      expect(parsed.error).toBe("Something went wrong");

      await server.close();
    });

    it("includes suggestion for 'Insufficient credits' error", async () => {
      vi.mocked(deductCredits).mockRejectedValue(
        new Error("Insufficient credits")
      );

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "search",
        arguments: { query: "test" },
      });

      expect(result.isError).toBe(true);
      const parsed = parseToolResult(result);
      expect(parsed.error).toBe("Insufficient credits");
      expect(parsed.suggestion).toContain("Submit a patch");

      await server.close();
    });

    it("includes suggestion for 'duplicate detected' error", async () => {
      vi.mocked(issueService.createIssue).mockRejectedValue(
        new Error("Duplicate detected: similar issue exists")
      );

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "report",
        arguments: { errorMessage: "Some error" },
      });

      expect(result.isError).toBe(true);
      const parsed = parseToolResult(result);
      expect(parsed.suggestion).toContain("already exists");

      await server.close();
    });

    it("includes suggestion for 'report limit reached' error", async () => {
      vi.mocked(issueService.createIssue).mockRejectedValue(
        new Error("Report limit reached")
      );

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "report",
        arguments: { errorMessage: "Some error" },
      });

      const parsed = parseToolResult(result);
      expect(parsed.suggestion).toContain("account age");

      await server.close();
    });

    it("includes suggestion for 'cannot verify your own' error", async () => {
      vi.mocked(verificationService.verify).mockRejectedValue(
        new Error("Cannot verify your own patch")
      );

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "verify",
        arguments: {
          patchId: "550e8400-e29b-41d4-a716-446655440000",
          outcome: "fixed",
        },
      });

      const parsed = parseToolResult(result);
      expect(parsed.suggestion).toContain("another agent");

      await server.close();
    });

    it("includes suggestion for 'already verified' error", async () => {
      vi.mocked(verificationService.verify).mockRejectedValue(
        new Error("Already verified this patch")
      );

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "verify",
        arguments: {
          patchId: "550e8400-e29b-41d4-a716-446655440000",
          outcome: "fixed",
        },
      });

      const parsed = parseToolResult(result);
      expect(parsed.suggestion).toContain("other patches");

      await server.close();
    });

    it("includes suggestion for 'not found' errors", async () => {
      vi.mocked(patchService.getPatchForAgent).mockRejectedValue(
        new Error("Patch not found")
      );

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "search",
        arguments: { patchId: "550e8400-e29b-41d4-a716-446655440000" },
      });

      const parsed = parseToolResult(result);
      expect(parsed.suggestion).toContain("search");

      await server.close();
    });

    it("includes suggestion for 'daily verification limit' error", async () => {
      vi.mocked(verificationService.verify).mockRejectedValue(
        new Error("Daily verification limit reached")
      );

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "verify",
        arguments: {
          patchId: "550e8400-e29b-41d4-a716-446655440000",
          outcome: "fixed",
        },
      });

      const parsed = parseToolResult(result);
      expect(parsed.suggestion).toContain("24 hours");

      await server.close();
    });

    it("returns no suggestion for unknown error patterns", async () => {
      vi.mocked(deductCredits).mockResolvedValue(9);
      vi.mocked(issueService.searchIssues).mockRejectedValue(
        new Error("Database connection timeout")
      );

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "search",
        arguments: { query: "test" },
      });

      const parsed = parseToolResult(result);
      expect(parsed.error).toBe("Database connection timeout");
      expect(parsed.suggestion).toBeUndefined();

      await server.close();
    });

    it("handles non-Error thrown values", async () => {
      vi.mocked(deductCredits).mockResolvedValue(9);
      vi.mocked(issueService.searchIssues).mockRejectedValue("string error");

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "search",
        arguments: { query: "test" },
      });

      const parsed = parseToolResult(result);
      expect(parsed.error).toBe("Unknown error");

      await server.close();
    });

    it("includes credits_remaining in error response when available", async () => {
      vi.mocked(issueService.searchIssues).mockRejectedValue(
        new Error("Something broke")
      );
      vi.mocked(getCredits).mockResolvedValue(7);

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "search",
        arguments: { query: "test" },
      });

      const parsed = parseToolResult(result);
      expect(parsed.credits_remaining).toBe(7);

      await server.close();
    });

    it("omits credits_remaining from error response when getCredits fails", async () => {
      vi.mocked(issueService.searchIssues).mockRejectedValue(
        new Error("Something broke")
      );
      vi.mocked(getCredits).mockRejectedValue(new Error("DB down"));

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "search",
        arguments: { query: "test" },
      });

      const parsed = parseToolResult(result);
      expect(parsed.credits_remaining).toBeUndefined();

      await server.close();
    });
  });

  describe("_meta.credits_remaining", () => {
    it("includes credits_remaining on successful tool calls", async () => {
      vi.mocked(getCredits).mockResolvedValue(42);
      vi.mocked(activityService.getMyActivity).mockResolvedValue({
        summary: { issues: 0, patches: 0, verifications: 0, credits: 42 },
        recent: [],
        actionable: [],
      });

      const { client, server } = await createTestClient();

      const result = await client.callTool({
        name: "my_activity",
        arguments: {},
      });

      expect(result._meta?.credits_remaining).toBe(42);

      await server.close();
    });
  });
});
