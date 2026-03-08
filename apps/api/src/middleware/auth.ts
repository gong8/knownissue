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
            karma: SIGNUP_BONUS,
          },
        });
      }

      c.set("user", {
        id: user.id,
        githubUsername: user.githubUsername,
        clerkId: user.clerkId,
        avatarUrl: user.avatarUrl,
        karma: user.karma,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });

      return next();
    }
  } catch {
    // Not a valid GitHub token, try next strategy
  }

  // Strategy 2: Clerk session token
  // For now, we'll look up the user by the Clerk user ID passed in a custom header
  const clerkUserId = c.req.header("X-Clerk-User-Id");
  if (clerkUserId) {
    let user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (user) {
      c.set("user", {
        id: user.id,
        githubUsername: user.githubUsername,
        clerkId: user.clerkId,
        avatarUrl: user.avatarUrl,
        karma: user.karma,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
      return next();
    }
  }

  throw new HTTPException(401, { message: "Invalid or expired token" });
});
