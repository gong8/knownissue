import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { verifyToken } from "@clerk/backend";
import { createHash } from "node:crypto";
import { prisma } from "@knownissue/db";
import { SIGNUP_BONUS } from "@knownissue/shared";
import type { User } from "@knownissue/shared";
import type { AppEnv } from "../lib/types";

// Token validation cache — avoids redundant GitHub API calls
const validTokenCache = new Map<string, { user: User; expiresAt: number }>();
const invalidTokenCache = new Map<string, number>(); // hash -> expiresAt

const VALID_TTL = 5 * 60 * 1000;   // 5 minutes
const INVALID_TTL = 60 * 1000;      // 1 minute

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getCachedValid(hash: string): User | null {
  const entry = validTokenCache.get(hash);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    validTokenCache.delete(hash);
    return null;
  }
  return entry.user;
}

function isCachedInvalid(hash: string): boolean {
  const expiresAt = invalidTokenCache.get(hash);
  if (expiresAt === undefined) return false;
  if (Date.now() > expiresAt) {
    invalidTokenCache.delete(hash);
    return false;
  }
  return true;
}

// Periodic cleanup (every 60 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of validTokenCache) {
    if (now > entry.expiresAt) validTokenCache.delete(key);
  }
  for (const [key, expiresAt] of invalidTokenCache) {
    if (now > expiresAt) invalidTokenCache.delete(key);
  }
}, 60 * 1000).unref();

function toUserData(user: {
  id: string;
  githubUsername: string;
  clerkId: string | null;
  avatarUrl: string | null;
  credits: number;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}): User {
  return {
    id: user.id,
    githubUsername: user.githubUsername,
    clerkId: user.clerkId,
    avatarUrl: user.avatarUrl,
    credits: user.credits,
    role: user.role as User["role"],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function authenticateGitHub(token: string, tokenHash: string): Promise<User | null> {
  // Check valid cache first
  const cachedUser = getCachedValid(tokenHash);
  if (cachedUser) return cachedUser;

  // Check invalid cache — skip GitHub API if we know it's bad
  if (isCachedInvalid(tokenHash)) return null;

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

      const userData = toUserData(user);

      // Cache valid result
      validTokenCache.set(tokenHash, { user: userData, expiresAt: Date.now() + VALID_TTL });

      return userData;
    } else {
      // GitHub said invalid — cache it
      invalidTokenCache.set(tokenHash, Date.now() + INVALID_TTL);
    }
  } catch {
    // Network error — don't cache, try next strategy
  }

  return null;
}

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const authorization = c.req.header("Authorization");

  if (!authorization) {
    throw new HTTPException(401, { message: "Authorization header required" });
  }

  const token = authorization.replace("Bearer ", "");

  if (!token) {
    throw new HTTPException(401, { message: "Invalid authorization token" });
  }

  // Strategy 1: GitHub personal access token (with cache)
  const tokenHash = hashToken(token);
  const ghUser = await authenticateGitHub(token, tokenHash);
  if (ghUser) {
    c.set("user", ghUser);
    return next();
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

      c.set("user", toUserData(user));

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

  // Strategy 1: GitHub personal access token (with cache)
  const tokenHash = hashToken(token);
  const ghUser = await authenticateGitHub(token, tokenHash);
  if (ghUser) {
    c.set("user", ghUser);
    return next();
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

      c.set("user", toUserData(user));

      return next();
    }
  } catch (e) {
    console.error("[auth] Clerk JWT verification failed:", e);
  }

  // Optional auth — don't throw, just continue without user
  return next();
});
