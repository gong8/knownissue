import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { structuredLogger } from "./logger";
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

describe("structuredLogger middleware", () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockReturnValue(true);
  });

  function parseLogEntry(): Record<string, unknown> {
    const call = writeSpy.mock.calls[0];
    expect(call).toBeDefined();
    return JSON.parse(call![0] as string);
  }

  it("logs JSON with method, path, status, and duration", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", structuredLogger);
    app.get("/hello", (c) => c.json({ ok: true }));

    const res = await app.request("/hello");
    expect(res.status).toBe(200);

    const entry = parseLogEntry();
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/hello");
    expect(entry.status).toBe(200);
    expect(typeof entry.duration).toBe("number");
    expect(typeof entry.timestamp).toBe("string");
  });

  it("includes userId when user is set on context", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("user", makeUser({ id: "user-42" }));
      return next();
    });
    app.use("*", structuredLogger);
    app.get("/test", (c) => c.json({ ok: true }));

    await app.request("/test");

    const entry = parseLogEntry();
    expect(entry.userId).toBe("user-42");
  });

  it("logs null userId when no user is set", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", structuredLogger);
    app.get("/test", (c) => c.json({ ok: true }));

    await app.request("/test");

    const entry = parseLogEntry();
    expect(entry.userId).toBeNull();
  });

  it("includes error fields when route throws", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", structuredLogger);
    app.get("/boom", () => {
      throw new Error("something broke");
    });
    // Re-throw from onError so the error propagates through
    // Hono's compose chain back to the middleware's catch block.
    app.onError((err) => {
      throw err;
    });

    // The middleware re-throws after logging, so app.request() rejects.
    try {
      await app.request("/boom");
    } catch {
      // expected
    }

    const entry = parseLogEntry();
    expect(entry.status).toBe(500);
    expect(entry.error).toBe("something broke");
    expect(entry.errorType).toBe("Error");
  });

  it("uses x-forwarded-for for IP", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", structuredLogger);
    app.get("/test", (c) => c.json({ ok: true }));

    await app.request("/test", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    const entry = parseLogEntry();
    expect(entry.ip).toBe("1.2.3.4");
  });
});
