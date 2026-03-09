import { Hono } from "hono";
import type { Context } from "hono";
import { getApiBaseUrl } from "./utils.js";

const metadata = new Hono();

const protectedResourceHandler = (c: Context) => {
  const baseUrl = getApiBaseUrl();
  return c.json({
    resource: baseUrl,
    authorization_servers: [baseUrl],
    scopes_supported: ["mcp:tools"],
    bearer_methods_supported: ["header"],
  });
};

const authServerHandler = (c: Context) => {
  const baseUrl = getApiBaseUrl();
  return c.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    revocation_endpoint: `${baseUrl}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp:tools"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: false,
  });
};

// Root well-known endpoints
metadata.get("/.well-known/oauth-protected-resource", protectedResourceHandler);
metadata.get("/.well-known/oauth-authorization-server", authServerHandler);

// RFC 8414 path-suffixed endpoints (clients append MCP endpoint path)
metadata.get("/.well-known/oauth-protected-resource/mcp", protectedResourceHandler);
metadata.get("/.well-known/oauth-authorization-server/mcp", authServerHandler);

export { metadata };
