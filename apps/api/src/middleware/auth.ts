import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { verifyToken } from "@clerk/backend";
import { prisma } from "@knownissue/db";
import { SIGNUP_BONUS } from "@knownissue/shared";
import type { AppEnv } from "../lib/types";

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const authorization = c.req.header("Authorization");

  if (!authorization) {
    throw new HTTPException(401, { message: "Authorization header required" });
  }

  const token = authorization.replace("Bearer ", "");

  if (!token) {
    throw new HTTPException(401, { message: "Invalid authorization token" });
  }

  // Strategy 1: GitHub personal access token
  try {
    const ghResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "knownissue-API",
      },
    });

    if (ghResponse.ok) {
      const ghUser = (await ghResponse.json()) as { login: string; avatar_url: string };

      let user = await prisma.user.findUnique({
        where: { githubUsername: ghUser.login },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            githubUsername: ghUser.login,
            avatarUrl: ghUser.avatar_url,
            credits: SIGNUP_BONUS,
          },
        });
      }

      c.set("user", {
        id: user.id,
        githubUsername: user.githubUsername,
        clerkId: user.clerkId,
        avatarUrl: user.avatarUrl,
        credits: user.credits,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });

      return next();
    }
  } catch {
    // Not a valid GitHub token, try next strategy
  }

  // Strategy 2: Clerk JWT token (cryptographic signature verification)
  try {
    const authorizedParties = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
      : ["http://localhost:3000"];

    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
      authorizedParties,
    });

    const clerkUserId = payload.sub;

    if (clerkUserId) {
      let user = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
      });

      if (!user) {
        const username =
          (payload as Record<string, unknown>).username as string | undefined ||
          `user-${clerkUserId.slice(0, 8)}`;
        user = await prisma.user.create({
          data: {
            githubUsername: username,
            clerkId: clerkUserId,
            avatarUrl: ((payload as Record<string, unknown>).image_url as string | undefined) ?? null,
            credits: SIGNUP_BONUS,
          },
        });
      }

      c.set("user", {
        id: user.id,
        githubUsername: user.githubUsername,
        clerkId: user.clerkId,
        avatarUrl: user.avatarUrl,
        credits: user.credits,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });

      return next();
    }
  } catch (e) {
    console.error("[auth] Clerk JWT verification failed:", e);
  }

  throw new HTTPException(401, { message: "Invalid or expired token" });
});

export const optionalAuthMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const authorization = c.req.header("Authorization");

  if (!authorization) {
    return next();
  }

  const token = authorization.replace("Bearer ", "");

  if (!token) {
    return next();
  }

  // Strategy 1: GitHub personal access token
  try {
    const ghResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "knownissue-API",
      },
    });

    if (ghResponse.ok) {
      const ghUser = (await ghResponse.json()) as { login: string; avatar_url: string };

      let user = await prisma.user.findUnique({
        where: { githubUsername: ghUser.login },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            githubUsername: ghUser.login,
            avatarUrl: ghUser.avatar_url,
            credits: SIGNUP_BONUS,
          },
        });
      }

      c.set("user", {
        id: user.id,
        githubUsername: user.githubUsername,
        clerkId: user.clerkId,
        avatarUrl: user.avatarUrl,
        credits: user.credits,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });

      return next();
    }
  } catch {
    // Not a valid GitHub token, try next strategy
  }

  // Strategy 2: Clerk JWT token (cryptographic signature verification)
  try {
    const authorizedParties = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
      : ["http://localhost:3000"];

    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
      authorizedParties,
    });

    const clerkUserId = payload.sub;

    if (clerkUserId) {
      let user = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
      });

      if (!user) {
        const username =
          (payload as Record<string, unknown>).username as string | undefined ||
          `user-${clerkUserId.slice(0, 8)}`;
        user = await prisma.user.create({
          data: {
            githubUsername: username,
            clerkId: clerkUserId,
            avatarUrl: ((payload as Record<string, unknown>).image_url as string | undefined) ?? null,
            credits: SIGNUP_BONUS,
          },
        });
      }

      c.set("user", {
        id: user.id,
        githubUsername: user.githubUsername,
        clerkId: user.clerkId,
        avatarUrl: user.avatarUrl,
        credits: user.credits,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });

      return next();
    }
  } catch (e) {
    console.error("[auth] Clerk JWT verification failed:", e);
  }

  // Optional auth — don't throw, just continue without user
  return next();
});
