import { Hono } from "hono";
import { prisma } from "@knownissue/db";
import { generateClientId, isValidRedirectUri } from "./utils.js";

const register = new Hono();

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
  const resolvedResponseTypes = response_types ?? ["code"];

  const clientId = generateClientId();

  await prisma.oAuthClient.create({
    data: {
      clientId,
      clientName: client_name,
      redirectUris: redirect_uris,
      grantTypes: resolvedGrantTypes,
    },
  });

  return c.json({
    client_id: clientId,
    client_name,
    redirect_uris,
    grant_types: resolvedGrantTypes,
    response_types: resolvedResponseTypes,
  }, 201);
});

export { register };
