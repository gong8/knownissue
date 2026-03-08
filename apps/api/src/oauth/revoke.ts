import { Hono } from "hono";
import { prisma } from "@knownissue/db";
import { hashToken, ACCESS_TOKEN_PREFIX, REFRESH_TOKEN_PREFIX } from "./utils.js";

const revoke = new Hono();

revoke.post("/oauth/revoke", async (c) => {
  const contentType = c.req.header("content-type") || "";
  const body = contentType.includes("application/json")
    ? await c.req.json()
    : await c.req.parseBody();

  const token = typeof body.token === "string" ? body.token : String(body.token || "");
  const tokenTypeHint =
    typeof body.token_type_hint === "string" ? body.token_type_hint : undefined;

  if (!token) {
    return c.json(
      {
        error: "invalid_request",
        error_description: "Missing required field: token",
      },
      400
    );
  }

  // Determine lookup order based on token_type_hint
  if (tokenTypeHint === "refresh_token") {
    await revokeRefreshToken(token) || (await revokeAccessToken(token));
  } else {
    await revokeAccessToken(token) || (await revokeRefreshToken(token));
  }

  // RFC 7009: always return 200 OK regardless of whether the token existed
  return c.body(null, 200);
});

async function revokeAccessToken(token: string): Promise<boolean> {
  if (!token.startsWith(ACCESS_TOKEN_PREFIX)) {
    return false;
  }

  const tokenHash = hashToken(token);
  const accessToken = await prisma.oAuthAccessToken.findUnique({
    where: { tokenHash },
  });

  if (!accessToken || accessToken.revokedAt) {
    return false;
  }

  await prisma.oAuthAccessToken.update({
    where: { id: accessToken.id },
    data: { revokedAt: new Date() },
  });

  return true;
}

async function revokeRefreshToken(token: string): Promise<boolean> {
  if (!token.startsWith(REFRESH_TOKEN_PREFIX)) {
    return false;
  }

  const tokenHash = hashToken(token);
  const refreshToken = await prisma.oAuthRefreshToken.findUnique({
    where: { tokenHash },
  });

  if (!refreshToken || refreshToken.revokedAt) {
    return false;
  }

  // Revoke both the refresh token and its associated access token
  const now = new Date();
  await prisma.$transaction([
    prisma.oAuthRefreshToken.update({
      where: { id: refreshToken.id },
      data: { revokedAt: now },
    }),
    prisma.oAuthAccessToken.update({
      where: { id: refreshToken.accessTokenId },
      data: { revokedAt: now },
    }),
  ]);

  return true;
}

export { revoke };
