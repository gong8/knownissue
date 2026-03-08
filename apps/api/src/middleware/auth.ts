import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createHash } from "node:crypto";
import { verifyToken } from "@clerk/backend";
import { prisma } from "@knownissue/db";
import { SIGNUP_BONUS } from "@knownissue/shared";
import type { User } from "@knownissue/shared";
import type { AppEnv } from "../lib/types";
import { getApiBaseUrl } from "../oauth/utils";

// GitHub token cache (deprecated path — will be removed before launch)
const validGhCache = new Map<string, { user: User; expiresAt: number }>();
const invalidGhCache = new Map<string, number>();
const GH_VALID_TTL = 5 * 60 * 1000;
const GH_INVALID_TTL = 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of validGhCache) if (now > v.expiresAt) validGhCache.delete(k);
  for (const [k, v] of invalidGhCache) if (now > v) invalidGhCache.delete(k);
}, 60_000).unref();

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function toUser(row: {
  id: string;
  githubUsername: string | null;
  clerkId: string;
  avatarUrl: string | null;
  credits: number;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}): User {
  return {
    id: row.id,
    githubUsername: row.githubUsername,
    clerkId: row.clerkId,
    avatarUrl: row.avatarUrl,
    credits: row.credits,
    role: row.role as User["role"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Strategy 1: knownissue OAuth access token (ki_xxx)
 */
async function authenticateKnownissueToken(token: string): Promise<User | null> {
  if (!token.startsWith("ki_")) return null;

  const hash = sha256(token);
  const record = await prisma.oAuthAccessToken.findUnique({
    where: { tokenHash: hash },
    include: { user: true },
  });

  if (!record) return null;
  if (record.revokedAt) return null;
  if (new Date() > record.expiresAt) return null;

  return toUser(record.user);
}

/**
 * Strategy 2: Clerk JWT
 */
async function authenticateClerkJwt(token: string): Promise<User | null> {
  try {
    const authorizedParties = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
      : ["http://localhost:3000"];

    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
      authorizedParties,
    });

    const clerkUserId = payload.sub;
    if (!clerkUserId) return null;

    let user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          clerkId: clerkUserId,
          credits: SIGNUP_BONUS,
        },
      });
    }

    return toUser(user);
  } catch {
    return null;
  }
}

/**
 * Strategy 3: GitHub PAT (DEPRECATED — remove before launch)
 */
async function authenticateGitHubPat(token: string): Promise<User | null> {
  const hash = sha256(token);

  // Check caches
  const cached = validGhCache.get(hash);
  if (cached && Date.now() <= cached.expiresAt) return cached.user;

  const invalidAt = invalidGhCache.get(hash);
  if (invalidAt && Date.now() <= invalidAt) return null;

  try {
    const resp = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "knownissue-API",
      },
    });

    if (!resp.ok) {
      invalidGhCache.set(hash, Date.now() + GH_INVALID_TTL);
      return null;
    }

    const gh = (await resp.json()) as { login: string; avatar_url: string };

    let user = await prisma.user.findUnique({
      where: { githubUsername: gh.login },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          githubUsername: gh.login,
          clerkId: `gh_${gh.login}`, // temporary placeholder until Clerk link
          avatarUrl: gh.avatar_url,
          credits: SIGNUP_BONUS,
        },
      });
    }

    const userData = toUser(user);
    validGhCache.set(hash, { user: userData, expiresAt: Date.now() + GH_VALID_TTL });
    return userData;
  } catch {
    return null;
  }
}

/**
 * Resolve auth: tries all strategies in order.
 */
async function resolveUser(token: string): Promise<User | null> {
  // Strategy 1: knownissue token
  const kiUser = await authenticateKnownissueToken(token);
  if (kiUser) return kiUser;

  // Strategy 2: Clerk JWT
  const clerkUser = await authenticateClerkJwt(token);
  if (clerkUser) return clerkUser;

  // Strategy 3: GitHub PAT (deprecated)
  const ghUser = await authenticateGitHubPat(token);
  if (ghUser) return ghUser;

  return null;
}

function extractToken(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const auth = c.req.header("Authorization");
  if (!auth) return null;
  const token = auth.replace("Bearer ", "");
  return token || null;
}

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractToken(c);

  if (!token) {
    throw new HTTPException(401, { message: "Authorization header required" });
  }

  const user = await resolveUser(token);

  if (!user) {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }

  c.set("user", user);
  return next();
});

export const optionalAuthMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractToken(c);

  if (token) {
    const user = await resolveUser(token);
    if (user) {
      c.set("user", user);
    }
  }

  return next();
});

function mcpUnauthorized(message: string): HTTPException {
  const baseUrl = getApiBaseUrl();
  return new HTTPException(401, {
    res: new Response(JSON.stringify({ error: message }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
      },
    }),
  });
}

/**
 * MCP-specific auth middleware: returns OAuth-compliant 401 with WWW-Authenticate.
 */
export const mcpAuthMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractToken(c);

  if (!token) {
    throw mcpUnauthorized("Authorization required");
  }

  const user = await resolveUser(token);

  if (!user) {
    throw mcpUnauthorized("Invalid or expired token");
  }

  c.set("user", user);
  return next();
});
