import { Hono } from "hono";
import type { Context } from "hono";
import { prisma } from "@knownissue/db";
import {
  hashToken,
  generateToken,
  verifyPkce,
  ACCESS_TOKEN_PREFIX,
  REFRESH_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
} from "./utils.js";

export const token = new Hono();

token.post("/", async (c) => {
  const contentType = c.req.header("content-type") || "";
  const body = contentType.includes("application/json")
    ? await c.req.json()
    : await c.req.parseBody();

  const grantType = typeof body.grant_type === "string" ? body.grant_type : String(body.grant_type || "");

  if (grantType === "authorization_code") {
    return handleAuthorizationCode(c, body);
  }

  if (grantType === "refresh_token") {
    return handleRefreshToken(c, body);
  }

  return c.json(
    {
      error: "unsupported_grant_type",
      error_description: "The grant_type must be 'authorization_code' or 'refresh_token'",
    },
    400
  );
});

async function handleAuthorizationCode(c: Context, body: Record<string, unknown>) {
  const code = typeof body.code === "string" ? body.code : String(body.code || "");
  const codeVerifier = typeof body.code_verifier === "string" ? body.code_verifier : String(body.code_verifier || "");
  const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : String(body.redirect_uri || "");
  const clientId = typeof body.client_id === "string" ? body.client_id : String(body.client_id || "");
  const resource = typeof body.resource === "string" ? body.resource : undefined;

  if (!code || !codeVerifier || !redirectUri || !clientId) {
    return c.json(
      {
        error: "invalid_request",
        error_description: "Missing required fields: code, code_verifier, redirect_uri, client_id",
      },
      400
    );
  }

  const hashedCode = hashToken(code);

  const authCode = await prisma.oAuthAuthorizationCode.findUnique({
    where: { code: hashedCode },
  });

  if (!authCode) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Invalid authorization code",
      },
      400
    );
  }

  if (authCode.expiresAt < new Date()) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Authorization code has expired",
      },
      400
    );
  }

  if (authCode.clientId !== clientId) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Client ID does not match",
      },
      400
    );
  }

  if (authCode.redirectUri !== redirectUri) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Redirect URI does not match",
      },
      400
    );
  }

  if (!verifyPkce(codeVerifier, authCode.codeChallenge)) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "PKCE verification failed",
      },
      400
    );
  }

  // RFC 8707: validate resource indicator
  // If the auth code was issued with a resource, the token request must match
  if (authCode.resource && resource !== authCode.resource) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Resource indicator does not match",
      },
      400
    );
  }

  // Atomically mark the code as used — prevents TOCTOU race where two
  // concurrent requests both pass validation before either marks it used.
  const { count } = await prisma.oAuthAuthorizationCode.updateMany({
    where: { code: hashedCode, usedAt: null },
    data: { usedAt: new Date() },
  });

  if (count === 0) {
    // OAuth 2.1 §4.1.2: SHOULD revoke all tokens previously issued based on this code
    const previousTokens = await prisma.oAuthAccessToken.findMany({
      where: {
        clientId,
        userId: authCode.userId,
        createdAt: { gte: authCode.createdAt },
        revokedAt: null,
      },
      select: { id: true },
    });

    if (previousTokens.length > 0) {
      const tokenIds = previousTokens.map((t) => t.id);
      await prisma.$transaction([
        prisma.oAuthAccessToken.updateMany({
          where: { id: { in: tokenIds } },
          data: { revokedAt: new Date() },
        }),
        prisma.oAuthRefreshToken.updateMany({
          where: { accessTokenId: { in: tokenIds }, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
    }

    return c.json(
      {
        error: "invalid_grant",
        error_description: "Authorization code has already been used",
      },
      400
    );
  }

  const accessToken = generateToken(ACCESS_TOKEN_PREFIX);
  const refreshToken = generateToken(REFRESH_TOKEN_PREFIX);

  // Store resource from the auth code (or from the token request if code had none)
  const resolvedResource = authCode.resource ?? resource ?? null;

  const accessTokenRecord = await prisma.oAuthAccessToken.create({
    data: {
      tokenHash: hashToken(accessToken),
      clientId,
      userId: authCode.userId,
      scopes: authCode.scopes,
      resource: resolvedResource,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL),
    },
  });

  await prisma.oAuthRefreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      accessTokenId: accessTokenRecord.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL),
    },
  });

  // OAuth 2.1 §4.2.2: MUST include Cache-Control: no-store on token responses
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");
  return c.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL / 1000),
    refresh_token: refreshToken,
    scope: authCode.scopes.join(" "),
    // RFC 8707 §3: include resource in token response for audience binding
    ...(resolvedResource && { resource: resolvedResource }),
  });
}

async function handleRefreshToken(c: Context, body: Record<string, unknown>) {
  const refreshTokenValue = typeof body.refresh_token === "string" ? body.refresh_token : String(body.refresh_token || "");
  const clientId = typeof body.client_id === "string" ? body.client_id : String(body.client_id || "");

  if (!refreshTokenValue || !clientId) {
    return c.json(
      {
        error: "invalid_request",
        error_description: "Missing required fields: refresh_token, client_id",
      },
      400
    );
  }

  const hashedRefreshToken = hashToken(refreshTokenValue);

  const refreshTokenRecord = await prisma.oAuthRefreshToken.findUnique({
    where: { tokenHash: hashedRefreshToken },
    include: { accessToken: true },
  });

  if (!refreshTokenRecord) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Invalid refresh token",
      },
      400
    );
  }

  if (refreshTokenRecord.revokedAt) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Refresh token has been revoked",
      },
      400
    );
  }

  if (refreshTokenRecord.expiresAt < new Date()) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Refresh token has expired",
      },
      400
    );
  }

  if (refreshTokenRecord.accessToken.clientId !== clientId) {
    return c.json(
      {
        error: "invalid_grant",
        error_description: "Client ID does not match",
      },
      400
    );
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.oAuthRefreshToken.update({
      where: { id: refreshTokenRecord.id },
      data: { revokedAt: now },
    }),
    prisma.oAuthAccessToken.update({
      where: { id: refreshTokenRecord.accessTokenId },
      data: { revokedAt: now },
    }),
  ]);

  const newAccessToken = generateToken(ACCESS_TOKEN_PREFIX);
  const newRefreshToken = generateToken(REFRESH_TOKEN_PREFIX);

  const newAccessTokenRecord = await prisma.oAuthAccessToken.create({
    data: {
      tokenHash: hashToken(newAccessToken),
      clientId,
      userId: refreshTokenRecord.accessToken.userId,
      scopes: refreshTokenRecord.accessToken.scopes,
      resource: refreshTokenRecord.accessToken.resource,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL),
    },
  });

  await prisma.oAuthRefreshToken.create({
    data: {
      tokenHash: hashToken(newRefreshToken),
      accessTokenId: newAccessTokenRecord.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL),
    },
  });

  // OAuth 2.1 §4.2.2: MUST include Cache-Control: no-store on token responses
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");
  return c.json({
    access_token: newAccessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL / 1000),
    refresh_token: newRefreshToken,
    scope: refreshTokenRecord.accessToken.scopes.join(" "),
    // RFC 8707 §3: include resource in token response for audience binding
    ...(refreshTokenRecord.accessToken.resource && { resource: refreshTokenRecord.accessToken.resource }),
  });
}
