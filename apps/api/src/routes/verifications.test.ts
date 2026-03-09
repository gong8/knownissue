import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import type { User } from "@knownissue/shared";

// Mock auth middleware
vi.mock("../middleware/auth", () => ({
  authMiddleware: vi.fn().mockImplementation(async (_c: unknown, next: () => Promise<void>) => next()),
}));

// Mock service layer
vi.mock("../services/verification", () => ({
  verify: vi.fn(),
}));

import { verifications } from "./verifications";
import * as verificationService from "../services/verification";

const mockUser: User = {
  id: "user-1",
  clerkId: "clerk-1",
  avatarUrl: null,
  credits: 10,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

function createApp(user?: User) {
  const app = new Hono<AppEnv>();

  if (user) {
    app.use("*", async (c, next) => {
      c.set("user", user);
      return next();
    });
  }

  app.route("/", verifications);
  return app;
}

describe("POST /verifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a verification and returns 201", async () => {
    const mockResult = {
      id: "ver-1",
      outcome: "fixed",
      note: "Works perfectly now",
      patchId: "patch-1",
      verifierId: "user-1",
      authorCreditDelta: 1,
      verifierCreditDelta: 2,
      _next_actions: ["Verification recorded"],
    };
    vi.mocked(verificationService.verify).mockResolvedValue(mockResult);

    const app = createApp(mockUser);
    const res = await app.request("/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patchId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        outcome: "fixed",
        note: "Works perfectly now",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("ver-1");
    expect(body.outcome).toBe("fixed");
    expect(body.authorCreditDelta).toBe(1);
    expect(body.verifierCreditDelta).toBe(2);
  });

  it("passes all parameters to verify service", async () => {
    vi.mocked(verificationService.verify).mockResolvedValue({ id: "ver-1" });

    const app = createApp(mockUser);
    await app.request("/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patchId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        outcome: "not_fixed",
        note: "Still crashes",
        errorBefore: "TypeError: cannot read property",
        errorAfter: "TypeError: cannot read property",
        testedVersion: "4.17.21",
        issueAccuracy: "accurate",
      }),
    });

    expect(verificationService.verify).toHaveBeenCalledWith(
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "not_fixed",
      "Still crashes",
      "TypeError: cannot read property",
      "TypeError: cannot read property",
      "4.17.21",
      "accurate",
      "user-1"
    );
  });

  it("accepts partial outcome", async () => {
    vi.mocked(verificationService.verify).mockResolvedValue({ id: "ver-1" });

    const app = createApp(mockUser);
    const res = await app.request("/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patchId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        outcome: "partial",
        note: "Partially fixes the issue",
      }),
    });

    expect(res.status).toBe(201);
    expect(verificationService.verify).toHaveBeenCalledWith(
      expect.any(String),
      "partial",
      "Partially fixes the issue",
      undefined,
      undefined,
      undefined,
      undefined,
      "user-1"
    );
  });

  it("returns 400 when patchId is missing", async () => {
    const app = createApp(mockUser);
    const res = await app.request("/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome: "fixed",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when outcome is missing", async () => {
    const app = createApp(mockUser);
    const res = await app.request("/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patchId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when outcome is invalid", async () => {
    const app = createApp(mockUser);
    const res = await app.request("/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patchId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        outcome: "invalid_outcome",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when patchId is not a valid UUID", async () => {
    const app = createApp(mockUser);
    const res = await app.request("/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patchId: "not-a-uuid",
        outcome: "fixed",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when service throws (self-verify)", async () => {
    vi.mocked(verificationService.verify).mockRejectedValue(
      new Error("Cannot verify your own patch")
    );

    const app = createApp(mockUser);
    const res = await app.request("/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patchId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        outcome: "fixed",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Cannot verify your own patch");
  });

  it("returns 400 when service throws (already verified)", async () => {
    vi.mocked(verificationService.verify).mockRejectedValue(
      new Error("You have already verified this patch")
    );

    const app = createApp(mockUser);
    const res = await app.request("/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patchId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        outcome: "fixed",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("You have already verified this patch");
  });

  it("returns 400 when service throws (daily cap)", async () => {
    vi.mocked(verificationService.verify).mockRejectedValue(
      new Error("Daily verification limit reached (20/day). Try again tomorrow.")
    );

    const app = createApp(mockUser);
    const res = await app.request("/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patchId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        outcome: "fixed",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Daily verification limit");
  });

  it("defaults note to null when not provided", async () => {
    vi.mocked(verificationService.verify).mockResolvedValue({ id: "ver-1" });

    const app = createApp(mockUser);
    await app.request("/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patchId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        outcome: "fixed",
      }),
    });

    expect(verificationService.verify).toHaveBeenCalledWith(
      expect.any(String),
      "fixed",
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      "user-1"
    );
  });

  it("accepts issueAccuracy inaccurate value", async () => {
    vi.mocked(verificationService.verify).mockResolvedValue({ id: "ver-1" });

    const app = createApp(mockUser);
    const res = await app.request("/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patchId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        outcome: "fixed",
        issueAccuracy: "inaccurate",
      }),
    });

    expect(res.status).toBe(201);
    expect(verificationService.verify).toHaveBeenCalledWith(
      expect.any(String),
      "fixed",
      null,
      undefined,
      undefined,
      undefined,
      "inaccurate",
      "user-1"
    );
  });
});
