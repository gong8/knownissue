import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

// Mock service layer
vi.mock("../services/revision", () => ({
  getIssueRevisions: vi.fn(),
  getIssueRevision: vi.fn(),
}));

import { revisions } from "./revisions";
import { getIssueRevisions, getIssueRevision } from "../services/revision";

function createApp() {
  const app = new Hono<AppEnv>();
  app.route("/", revisions);
  return app;
}

describe("GET /issues/:issueId/revisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns revisions with default pagination", async () => {
    const mockResult = {
      revisions: [
        {
          id: "rev-1",
          version: 2,
          action: "update",
          title: "Updated title",
          description: "Updated description",
          severity: "high",
          status: "open",
          tags: [],
          issueId: "issue-1",
          actorId: "user-1",
          createdAt: new Date("2025-01-15"),
        },
        {
          id: "rev-0",
          version: 1,
          action: "create",
          title: "Original title",
          description: "Original description",
          severity: "medium",
          status: "open",
          tags: [],
          issueId: "issue-1",
          actorId: "user-1",
          createdAt: new Date("2025-01-14"),
        },
      ],
      total: 2,
    };
    vi.mocked(getIssueRevisions).mockResolvedValue(mockResult);

    const app = createApp();
    const res = await app.request("/issues/issue-1/revisions");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revisions).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("passes issueId and default pagination to service", async () => {
    vi.mocked(getIssueRevisions).mockResolvedValue({
      revisions: [],
      total: 0,
    });

    const app = createApp();
    await app.request("/issues/issue-abc/revisions");

    expect(getIssueRevisions).toHaveBeenCalledWith("issue-abc", {
      limit: 10,
      offset: 0,
    });
  });

  it("passes custom limit and offset", async () => {
    vi.mocked(getIssueRevisions).mockResolvedValue({
      revisions: [],
      total: 0,
    });

    const app = createApp();
    await app.request("/issues/issue-1/revisions?limit=5&offset=10");

    expect(getIssueRevisions).toHaveBeenCalledWith("issue-1", {
      limit: 5,
      offset: 10,
    });
  });

  it("caps limit at 50", async () => {
    vi.mocked(getIssueRevisions).mockResolvedValue({
      revisions: [],
      total: 0,
    });

    const app = createApp();
    await app.request("/issues/issue-1/revisions?limit=100");

    expect(getIssueRevisions).toHaveBeenCalledWith("issue-1", {
      limit: 50,
      offset: 0,
    });
  });

  it("enforces minimum limit of 1", async () => {
    vi.mocked(getIssueRevisions).mockResolvedValue({
      revisions: [],
      total: 0,
    });

    const app = createApp();
    await app.request("/issues/issue-1/revisions?limit=0");

    expect(getIssueRevisions).toHaveBeenCalledWith("issue-1", {
      limit: 1,
      offset: 0,
    });
  });

  it("enforces minimum offset of 0", async () => {
    vi.mocked(getIssueRevisions).mockResolvedValue({
      revisions: [],
      total: 0,
    });

    const app = createApp();
    await app.request("/issues/issue-1/revisions?offset=-5");

    expect(getIssueRevisions).toHaveBeenCalledWith("issue-1", {
      limit: 10,
      offset: 0,
    });
  });

  it("does not require authentication", async () => {
    vi.mocked(getIssueRevisions).mockResolvedValue({
      revisions: [],
      total: 0,
    });

    const app = createApp();
    const res = await app.request("/issues/issue-1/revisions");

    expect(res.status).toBe(200);
  });
});

describe("GET /issues/:issueId/revisions/:version", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a specific revision", async () => {
    const mockRevision = {
      id: "rev-1",
      version: 1,
      action: "create",
      title: "Test Issue",
      description: "Test description",
      severity: "medium",
      status: "open",
      tags: ["lodash"],
      issueId: "issue-1",
      actorId: "user-1",
      createdAt: new Date("2025-01-14"),
    };
    vi.mocked(getIssueRevision).mockResolvedValue(mockRevision);

    const app = createApp();
    const res = await app.request("/issues/issue-1/revisions/1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("rev-1");
    expect(body.version).toBe(1);
    expect(body.title).toBe("Test Issue");
  });

  it("passes issueId and version to service", async () => {
    vi.mocked(getIssueRevision).mockResolvedValue(null);

    const app = createApp();
    await app.request("/issues/issue-abc/revisions/3");

    expect(getIssueRevision).toHaveBeenCalledWith("issue-abc", 3);
  });

  it("returns 404 when revision not found", async () => {
    vi.mocked(getIssueRevision).mockResolvedValue(null);

    const app = createApp();
    const res = await app.request("/issues/issue-1/revisions/99");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Revision not found");
  });

  it("returns 400 for non-numeric version", async () => {
    const app = createApp();
    const res = await app.request("/issues/issue-1/revisions/abc");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid version number");
  });

  it("returns 400 for version 0", async () => {
    const app = createApp();
    const res = await app.request("/issues/issue-1/revisions/0");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid version number");
  });

  it("returns 400 for negative version", async () => {
    const app = createApp();
    const res = await app.request("/issues/issue-1/revisions/-1");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid version number");
  });

  it("does not require authentication", async () => {
    vi.mocked(getIssueRevision).mockResolvedValue({
      id: "rev-1",
      version: 1,
      action: "create",
      title: "Test",
      description: "Test",
      severity: "medium",
      status: "open",
      tags: [],
      issueId: "issue-1",
      actorId: "user-1",
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await app.request("/issues/issue-1/revisions/1");

    expect(res.status).toBe(200);
  });
});
