import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
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
        "User-Agent": "KnownIssue-API",
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
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });

      return next();
    }
  } catch {
    // Not a valid GitHub token, try next strategy
  }

  // Strategy 2: Clerk JWT token
  // Decode JWT payload to get Clerk user ID (sub claim)
  // NOTE: Production should verify JWT signature using Clerk's JWKS
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      const clerkUserId = payload.sub as string;

      if (clerkUserId) {
        let user = await prisma.user.findUnique({
          where: { clerkId: clerkUserId },
        });

        if (!user) {
          // Auto-create user from Clerk
          const username = (payload.username as string) || `user-${clerkUserId.slice(0, 8)}`;
          user = await prisma.user.create({
            data: {
              githubUsername: username,
              clerkId: clerkUserId,
              avatarUrl: (payload.image_url as string | undefined) ?? null,
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
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        });

        return next();
      }
    }
  } catch (e) {
    console.error("[auth] Strategy 2 (Clerk JWT) failed:", e);
  }

  throw new HTTPException(401, { message: "Invalid or expired token" });
});
