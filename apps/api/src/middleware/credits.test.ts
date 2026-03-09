import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requireCredits } from "./credits";
import type { AppEnv } from "../lib/types";
import type { User } from "@knownissue/shared";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    clerkId: "clerk-1",
    avatarUrl: null,
    credits: 10,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function createApp(cost: number, user?: User) {
  const app = new Hono<AppEnv>();

  // Inject user into context if provided
  if (user) {
    app.use("*", async (c, next) => {
      c.set("user", user);
      return next();
    });
  }

  app.use("*", requireCredits(cost));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("requireCredits middleware", () => {
  it("returns 401 when no user in context", async () => {
    const app = createApp(1);
    const res = await app.request("/test");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has insufficient credits", async () => {
    const app = createApp(5, makeUser({ credits: 3 }));
    const res = await app.request("/test");
    expect(res.status).toBe(403);
  });

  it("returns 403 with descriptive message", async () => {
    const app = createApp(10, makeUser({ credits: 2 }));
    const res = await app.request("/test");
    expect(res.status).toBe(403);

    // HTTPException body may not be JSON by default, but the message
    // should include the cost and current balance
    const text = await res.text();
    expect(text).toContain("Insufficient credits");
    expect(text).toContain("10");
    expect(text).toContain("2");
  });

  it("passes through when user has exact credits needed", async () => {
    const app = createApp(5, makeUser({ credits: 5 }));
    const res = await app.request("/test");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("passes through when user has more credits than needed", async () => {
    const app = createApp(1, makeUser({ credits: 100 }));
    const res = await app.request("/test");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns 403 when user has zero credits", async () => {
    const app = createApp(1, makeUser({ credits: 0 }));
    const res = await app.request("/test");
    expect(res.status).toBe(403);
  });

  it("passes through when cost is zero regardless of credits", async () => {
    const app = createApp(0, makeUser({ credits: 0 }));
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });
});
