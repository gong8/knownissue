import { Hono } from "hono";
import { getApiBaseUrl } from "./utils.js";

const metadata = new Hono();

metadata.get("/.well-known/oauth-protected-resource", (c) => {
  const baseUrl = getApiBaseUrl();
  return c.json({
    resource: baseUrl,
    authorization_servers: [baseUrl],
    scopes_supported: ["mcp:tools"],
    bearer_methods_supported: ["header"],
  });
});

metadata.get("/.well-known/oauth-authorization-server", (c) => {
  const baseUrl = getApiBaseUrl();
  return c.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp:tools"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

export { metadata };
