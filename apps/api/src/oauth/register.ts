import { Hono } from "hono";
import { prisma } from "@knownissue/db";
import { generateClientId, isValidRedirectUri } from "./utils.js";

const register = new Hono();

const SUPPORTED_GRANT_TYPES = ["authorization_code", "refresh_token"];
const SUPPORTED_RESPONSE_TYPES = ["code"];

register.post("/oauth/register", async (c) => {
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid_client_metadata" }, 400);
  }

  const { client_name, redirect_uris, grant_types, response_types } = body as {
    client_name?: string;
    redirect_uris?: string[];
    grant_types?: string[];
    response_types?: string[];
  };

  if (!client_name || typeof client_name !== "string") {
    return c.json({ error: "invalid_client_metadata", error_description: "client_name is required" }, 400);
  }

  if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return c.json({ error: "invalid_client_metadata", error_description: "redirect_uris is required" }, 400);
  }

  for (const uri of redirect_uris) {
    if (!isValidRedirectUri(uri)) {
      return c.json({
        error: "invalid_redirect_uri",
        error_description: `Invalid redirect URI: ${uri}. Must be localhost or HTTPS.`,
      }, 400);
    }
  }

  const resolvedGrantTypes = grant_types ?? ["authorization_code"];
  if (resolvedGrantTypes.some((g) => !SUPPORTED_GRANT_TYPES.includes(g))) {
    return c.json({
      error: "invalid_client_metadata",
      error_description: "Unsupported grant_type. Supported: authorization_code, refresh_token",
    }, 400);
  }

  const resolvedResponseTypes = response_types ?? ["code"];
  if (resolvedResponseTypes.some((r) => !SUPPORTED_RESPONSE_TYPES.includes(r))) {
    return c.json({
      error: "invalid_client_metadata",
      error_description: "Unsupported response_type. Supported: code",
    }, 400);
  }

  const clientId = generateClientId();

  await prisma.oAuthClient.create({
    data: {
      clientId,
      clientName: client_name,
      redirectUris: redirect_uris,
      grantTypes: resolvedGrantTypes,
    },
  });

  // OAuth 2.1 §4.2.2: MUST include Cache-Control: no-store on responses with credentials
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");
  return c.json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name,
    redirect_uris,
    grant_types: resolvedGrantTypes,
    response_types: resolvedResponseTypes,
    token_endpoint_auth_method: "none",
  }, 201);
});

export { register };
