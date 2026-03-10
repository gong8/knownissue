import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createHash } from "node:crypto";
import { verifyToken } from "@clerk/backend";
import { prisma } from "@knownissue/db";
import { SIGNUP_BONUS } from "@knownissue/shared";
import type { User } from "@knownissue/shared";
import type { AppEnv } from "../lib/types";
import { getApiBaseUrl } from "../oauth/utils";

type AuthResult = { user: User; scopes?: string[] };

export async function fetchClerkDisplayName(clerkId: string): Promise<string | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${clerkId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { first_name?: string; last_name?: string };
    const parts = [data.first_name, data.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : null;
  } catch {
    return null;
  }
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function toUser(row: {
  id: string;
  clerkId: string;
  displayName: string;
  avatarUrl: string | null;
  credits: number;
  createdAt: Date;
  updatedAt: Date;
}): User {
  return {
    id: row.id,
    clerkId: row.clerkId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    credits: row.credits,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Strategy 1: knownissue OAuth access token (ki_xxx)
 */
async function authenticateKnownissueToken(token: string): Promise<AuthResult | null> {
  if (!token.startsWith("ki_")) return null;

  const hash = sha256(token);
  const record = await prisma.oAuthAccessToken.findUnique({
    where: { tokenHash: hash },
    include: { user: true },
  });

  if (!record) return null;
  if (record.revokedAt) return null;
  if (new Date() > record.expiresAt) return null;

  // RFC 8707: if the token was issued for a specific resource, validate it
  // matches this server's base URL (normalize trailing slashes)
  if (record.resource) {
    const serverResource = getApiBaseUrl().replace(/\/+$/, "");
    const tokenResource = record.resource.replace(/\/+$/, "");
    if (tokenResource !== serverResource) return null;
  }

  return { user: toUser(record.user), scopes: record.scopes };
}

/**
 * Strategy 2: Clerk JWT
 */
async function authenticateClerkJwt(token: string): Promise<AuthResult | null> {
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
      const displayName = await fetchClerkDisplayName(clerkUserId) ?? "Unknown";
      user = await prisma.user.create({
        data: {
          clerkId: clerkUserId,
          displayName,
          credits: SIGNUP_BONUS,
        },
      });
    }

    return { user: toUser(user) };
  } catch {
    return null;
  }
}

/**
 * Resolve auth: tries all strategies in order.
 */
async function resolveUser(token: string): Promise<AuthResult | null> {
  // Strategy 1: knownissue token
  const kiResult = await authenticateKnownissueToken(token);
  if (kiResult) return kiResult;

  // Strategy 2: Clerk JWT
  const clerkResult = await authenticateClerkJwt(token);
  if (clerkResult) return clerkResult;

  return null;
}

function extractToken(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const auth = c.req.header("Authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractToken(c);

  if (!token) {
    throw new HTTPException(401, { message: "Authorization header required" });
  }

  const result = await resolveUser(token);

  if (!result) {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }

  c.set("user", result.user);
  return next();
});

export const optionalAuthMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractToken(c);

  if (token) {
    const result = await resolveUser(token);
    if (result) {
      c.set("user", result.user);
    }
  }

  return next();
});

function mcpUnauthorized(
  message: string,
  error?: { code: string; description: string }
): HTTPException {
  const baseUrl = getApiBaseUrl();
  const resourceMetadata = `resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`;
  const wwwAuthenticate = error
    ? `Bearer error="${error.code}", error_description="${error.description}", ${resourceMetadata}, scope="mcp:tools"`
    : `Bearer ${resourceMetadata}, scope="mcp:tools"`;
  return new HTTPException(401, {
    res: new Response(JSON.stringify({ error: message }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": wwwAuthenticate,
      },
    }),
  });
}

/**
 * MCP-specific auth middleware: returns OAuth-compliant 401 with WWW-Authenticate.
 * Enforces scope checks for OAuth tokens — requires "mcp:tools" scope.
 */
export const mcpAuthMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractToken(c);

  if (!token) {
    throw mcpUnauthorized("Authorization required");
  }

  const result = await resolveUser(token);

  if (!result) {
    throw mcpUnauthorized("Invalid or expired token", {
      code: "invalid_token",
      description: "The access token is invalid or expired",
    });
  }

  c.set("user", result.user);

  // Enforce scope for OAuth tokens (scopes defined = OAuth token)
  // Clerk auth has no scopes — implicit full access
  if (result.scopes && !result.scopes.includes("mcp:tools")) {
    const baseUrl = getApiBaseUrl();
    throw new HTTPException(403, {
      res: new Response(
        JSON.stringify({ error: "Forbidden: insufficient scope" }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer error="insufficient_scope", scope="mcp:tools", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource", error_description="The mcp:tools scope is required"`,
          },
        }
      ),
    });
  }

  return next();
});
