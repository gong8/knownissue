import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import type { User } from "@knownissue/shared";

// Mock auth middleware
vi.mock("../middleware/auth", () => ({
  authMiddleware: vi.fn().mockImplementation(async (_c: unknown, next: () => Promise<void>) => next()),
}));

// Mock service layer
vi.mock("../services/patch", () => ({
  submitPatch: vi.fn(),
  getPatchById: vi.fn(),
  getPatchForAgent: vi.fn(),
}));

import { patches } from "./patches";
import * as patchService from "../services/patch";

const ISSUE_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const ISSUE_UUID_2 = "b2c3d4e5-f6a7-8901-bcde-f12345678901";

const mockUser: User = {
  id: "user-1",
  clerkId: "clerk-1",
  avatarUrl: null,
  credits: 10,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

/**
 * Create an app with the patches routes mounted.
 * Optionally inject a user into context to simulate auth.
 */
function createApp(user?: User) {
  const app = new Hono<AppEnv>();

  if (user) {
    app.use("*", async (c, next) => {
      c.set("user", user);
      return next();
    });
  }

  app.route("/", patches);
  return app;
}

describe("POST /issues/:issueId/patches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a patch and returns 201", async () => {
    const mockPatch = {
      id: "patch-1",
      explanation: "Upgrade lodash to fix prototype pollution",
      steps: [{ type: "version_bump", package: "lodash", to: "4.17.21" }],
      issueId: ISSUE_UUID,
      submitterId: "user-1",
      creditsAwarded: 5,
      creditsBalance: 15,
    };
    vi.mocked(patchService.submitPatch).mockResolvedValue(mockPatch);

    const app = createApp(mockUser);
    const res = await app.request(`/issues/${ISSUE_UUID}/patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        explanation: "Upgrade lodash to fix prototype pollution",
        steps: [{ type: "version_bump", package: "lodash", to: "4.17.21" }],
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("patch-1");
    expect(body.creditsAwarded).toBe(5);
  });

  it("passes issueId from URL param to submitPatch", async () => {
    vi.mocked(patchService.submitPatch).mockResolvedValue({ id: "patch-1" });

    const app = createApp(mockUser);
    await app.request(`/issues/${ISSUE_UUID_2}/patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        explanation: "Fix the crash by adding a null check before accessing the property",
        steps: [{ type: "instruction", text: "Add null check" }],
      }),
    });

    expect(patchService.submitPatch).toHaveBeenCalledWith(
      ISSUE_UUID_2,
      expect.any(String),
      expect.any(Array),
      undefined,
      "user-1"
    );
  });

  it("returns 400 when explanation is missing", async () => {
    const app = createApp(mockUser);
    const res = await app.request(`/issues/${ISSUE_UUID}/patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steps: [{ type: "instruction", text: "Do something" }],
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when steps array is empty", async () => {
    const app = createApp(mockUser);
    const res = await app.request(`/issues/${ISSUE_UUID}/patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        explanation: "Fix the crash by adding a null check before accessing the property",
        steps: [],
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when steps is missing", async () => {
    const app = createApp(mockUser);
    const res = await app.request(`/issues/${ISSUE_UUID}/patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        explanation: "Fix the crash by adding a null check before accessing the property",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when issueId is not a valid UUID", async () => {
    const app = createApp(mockUser);
    const res = await app.request("/issues/not-a-uuid/patches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        explanation: "Fix the crash by adding a null check before accessing the property",
        steps: [{ type: "instruction", text: "Add null check" }],
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when service throws an error", async () => {
    vi.mocked(patchService.submitPatch).mockRejectedValue(
      new Error("Issue not found")
    );

    const app = createApp(mockUser);
    const res = await app.request(`/issues/${ISSUE_UUID}/patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        explanation: "Fix the crash by adding a null check before accessing the property",
        steps: [{ type: "instruction", text: "Add null check" }],
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Issue not found");
  });

  it("passes versionConstraint when provided", async () => {
    vi.mocked(patchService.submitPatch).mockResolvedValue({ id: "patch-1" });

    const app = createApp(mockUser);
    await app.request(`/issues/${ISSUE_UUID}/patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        explanation: "Fix the crash by adding a null check before accessing the property",
        steps: [{ type: "instruction", text: "Add null check" }],
        versionConstraint: ">=4.17.0 <5.0.0",
      }),
    });

    expect(patchService.submitPatch).toHaveBeenCalledWith(
      ISSUE_UUID,
      expect.any(String),
      expect.any(Array),
      ">=4.17.0 <5.0.0",
      "user-1"
    );
  });

  it("handles code_change step type", async () => {
    vi.mocked(patchService.submitPatch).mockResolvedValue({ id: "patch-1" });

    const app = createApp(mockUser);
    const res = await app.request(`/issues/${ISSUE_UUID}/patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        explanation: "Fix the crash by adding a null check before accessing the property",
        steps: [{
          type: "code_change",
          filePath: "src/index.ts",
          language: "typescript",
          before: "const x = obj.prop;",
          after: "const x = obj?.prop;",
        }],
      }),
    });

    expect(res.status).toBe(201);
  });

  it("handles config_change step type", async () => {
    vi.mocked(patchService.submitPatch).mockResolvedValue({ id: "patch-1" });

    const app = createApp(mockUser);
    const res = await app.request(`/issues/${ISSUE_UUID}/patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        explanation: "Fix the crash by updating the config to enable strict mode",
        steps: [{
          type: "config_change",
          file: "tsconfig.json",
          key: "strict",
          action: "set",
          value: "true",
        }],
      }),
    });

    expect(res.status).toBe(201);
  });

  it("handles command step type", async () => {
    vi.mocked(patchService.submitPatch).mockResolvedValue({ id: "patch-1" });

    const app = createApp(mockUser);
    const res = await app.request(`/issues/${ISSUE_UUID}/patches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        explanation: "Fix the crash by clearing the build cache and reinstalling",
        steps: [{ type: "command", command: "npm cache clean --force" }],
      }),
    });

    expect(res.status).toBe(201);
  });
});

describe("GET /patches/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns patch when found", async () => {
    const mockPatch = {
      id: "patch-1",
      explanation: "Fix prototype pollution",
      steps: [{ type: "version_bump", package: "lodash", to: "4.17.21" }],
      issueId: ISSUE_UUID,
      submitterId: "user-1",
    };
    vi.mocked(patchService.getPatchById).mockResolvedValue(mockPatch);

    const app = createApp(mockUser);
    const res = await app.request("/patches/patch-1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("patch-1");
    expect(body.explanation).toBe("Fix prototype pollution");
  });

  it("returns 404 when patch not found", async () => {
    vi.mocked(patchService.getPatchById).mockResolvedValue(null);

    const app = createApp(mockUser);
    const res = await app.request("/patches/nonexistent");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Patch not found");
  });

  it("passes the id param to getPatchById", async () => {
    vi.mocked(patchService.getPatchById).mockResolvedValue(null);

    const app = createApp(mockUser);
    await app.request("/patches/abc-123-def");

    expect(patchService.getPatchById).toHaveBeenCalledWith("abc-123-def");
  });
});

describe("POST /patches/:id/access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records patch access and returns patch data", async () => {
    const mockPatch = {
      id: "patch-1",
      explanation: "Fix the bug",
      relatedIssues: [],
      _next_actions: ["Apply this patch, then call verify with the outcome"],
    };
    vi.mocked(patchService.getPatchForAgent).mockResolvedValue(mockPatch);

    const app = createApp(mockUser);
    const res = await app.request("/patches/patch-1/access", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("patch-1");
    expect(patchService.getPatchForAgent).toHaveBeenCalledWith("patch-1", "user-1");
  });

  it("returns 400 when service throws", async () => {
    vi.mocked(patchService.getPatchForAgent).mockRejectedValue(
      new Error("Patch not found")
    );

    const app = createApp(mockUser);
    const res = await app.request("/patches/patch-1/access", {
      method: "POST",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Patch not found");
  });

  it("passes the patch id and user id to getPatchForAgent", async () => {
    vi.mocked(patchService.getPatchForAgent).mockResolvedValue({
      id: "patch-abc",
      relatedIssues: [],
      _next_actions: [],
    });

    const app = createApp(mockUser);
    await app.request("/patches/patch-abc/access", { method: "POST" });

    expect(patchService.getPatchForAgent).toHaveBeenCalledWith("patch-abc", "user-1");
  });
});
