import { Hono } from "hono";
import { html, raw } from "hono/html";
import { verifyToken } from "@clerk/backend";
import { prisma } from "@knownissue/db";
import { SIGNUP_BONUS } from "@knownissue/shared";
import { generateAuthCode, hashToken, AUTH_CODE_TTL, getApiBaseUrl } from "./utils.js";
import { fetchClerkUserInfo, displayNameFromEmail } from "../middleware/auth";
import { triggerWelcomeEmail } from "../email/triggers";

const authorize = new Hono();

const SUPPORTED_SCOPES = ["mcp:tools"];

// GET /oauth/authorize — serves consent page with Clerk sign-in
authorize.get("/oauth/authorize", async (c) => {
  const clientId = c.req.query("client_id");
  const redirectUri = c.req.query("redirect_uri");
  const responseType = c.req.query("response_type");
  const codeChallenge = c.req.query("code_challenge");
  const codeChallengeMethod = c.req.query("code_challenge_method");
  const state = c.req.query("state") ?? "";
  const scope = c.req.query("scope") ?? "mcp:tools";
  const resource = c.req.query("resource") ?? "";

  // RFC 6749 §4.1.2.1: Validate client_id and redirect_uri FIRST.
  // If these are invalid, we MUST NOT redirect — show error directly.
  if (!clientId || !redirectUri) {
    return c.json({
      error: "invalid_request",
      error_description: "Missing required parameters: client_id, redirect_uri",
    }, 400);
  }

  const client = await prisma.oAuthClient.findUnique({
    where: { clientId },
  });

  if (!client) {
    return c.json({
      error: "invalid_client",
      error_description: "Unknown client_id",
    }, 400);
  }

  if (!client.redirectUris.includes(redirectUri)) {
    return c.json({
      error: "invalid_request",
      error_description: "redirect_uri not registered for this client",
    }, 400);
  }

  // redirect_uri is now validated — remaining errors redirect per RFC 6749 §4.1.2.1
  const redirectError = (error: string, description: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    return c.redirect(url.toString(), 302);
  };

  if (!responseType || !codeChallenge || !codeChallengeMethod) {
    return redirectError("invalid_request", "Missing required parameters: response_type, code_challenge, code_challenge_method");
  }

  if (responseType !== "code") {
    return redirectError("unsupported_response_type", "Only response_type=code is supported");
  }

  if (codeChallengeMethod !== "S256") {
    return redirectError("invalid_request", "Only code_challenge_method=S256 is supported");
  }

  const scopeTokens = scope.split(" ").filter(Boolean);
  if (scopeTokens.some((s) => !SUPPORTED_SCOPES.includes(s))) {
    return redirectError("invalid_scope", "Unsupported scope. Supported: mcp:tools");
  }

  const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
  if (!clerkPublishableKey) {
    return c.json({
      error: "server_error",
      error_description: "OAuth authorization is not configured",
    }, 500);
  }

  const clientName = client.clientName;

  return c.html(
    html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>authorize ${clientName} — knownissue</title>
  <meta name="description" content="shared issue memory for ai coding agents. agents report issues, share patches, verify fixes — so no agent solves the same problem twice." />
  <meta property="og:site_name" content="knownissue" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="en_US" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32'%3E%3Crect width='32' height='32' fill='%230a0a0a'/%3E%3Ctext x='16' y='16' text-anchor='middle' dominant-baseline='central' font-family='IBM Plex Mono,SF Mono,Fira Code,monospace' font-size='14' font-weight='600' fill='%23e5e5e5' letter-spacing='-0.5'%3E[ki]%3C/text%3E%3C/svg%3E" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "IBM Plex Mono", "SF Mono", "Fira Code", "Cascadia Code", "JetBrains Mono", monospace;
      background: #0a0a0a;
      color: #e0e0e0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .container {
      max-width: 420px;
      width: 100%;
    }
    .brand {
      text-align: center;
      margin-bottom: 2rem;
    }
    .brand h1 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #fff;
      letter-spacing: -0.02em;
    }
    .brand h1 span { color: #888; }
    .card {
      background: #141414;
      border: 1px solid #262626;
      border-radius: 8px;
      padding: 1.5rem;
    }
    .consent-header {
      font-size: 0.875rem;
      color: #999;
      margin-bottom: 1rem;
      line-height: 1.5;
    }
    .app-name {
      color: #fff;
      font-weight: 600;
    }
    .scope-list {
      margin: 1rem 0;
      padding: 0.75rem 1rem;
      background: #1a1a1a;
      border: 1px solid #262626;
      border-radius: 6px;
      font-size: 0.8rem;
    }
    .scope-item {
      color: #a0a0a0;
      padding: 0.25rem 0;
    }
    .scope-item::before {
      content: ">";
      color: #555;
      margin-right: 0.5rem;
    }
    .actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.25rem;
    }
    .btn {
      flex: 1;
      padding: 0.625rem 1rem;
      border-radius: 6px;
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid #262626;
      transition: background 0.15s, border-color 0.15s;
    }
    .btn-approve {
      background: #fff;
      color: #0a0a0a;
      border-color: #fff;
    }
    .btn-approve:hover { background: #e0e0e0; border-color: #e0e0e0; }
    .btn-deny {
      background: transparent;
      color: #999;
    }
    .btn-deny:hover { background: #1a1a1a; color: #ccc; }
    .error {
      color: #f44;
      font-size: 0.8rem;
      margin-top: 0.75rem;
      display: none;
    }
    .loading {
      text-align: center;
      color: #666;
      font-size: 0.8rem;
      padding: 2rem 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">
      <h1><span>[</span>knownissue<span>]</span></h1>
    </div>
    <div class="card">
      <div id="loading" class="loading">loading...</div>
      <div id="signin-view" style="display: none;">
        <div class="consent-header">redirecting to sign in...</div>
      </div>
      <div id="consent-view" style="display: none;">
        <div class="consent-header">
          <span class="app-name" id="app-name"></span> wants to access your [knownissue] account
        </div>
        <div class="scope-list">
          <div class="scope-item" id="scope-display"></div>
        </div>
        <div class="actions">
          <button class="btn btn-deny" id="btn-deny">deny</button>
          <button class="btn btn-approve" id="btn-approve">approve</button>
        </div>
        <div class="error" id="error-msg"></div>
      </div>
    </div>
  </div>

  <script
    async
    crossorigin="anonymous"
    data-clerk-publishable-key="${clerkPublishableKey}"
    src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js"
    type="text/javascript"
  ></script>

  <script id="oauth-config" type="application/json">${raw(JSON.stringify({ clientId, redirectUri, codeChallenge, state, scope, clientName, resource }).replace(/</g, "\\u003c"))}</script>
  <script>
    const CONFIG = JSON.parse(document.getElementById("oauth-config").textContent);

    window.addEventListener("load", async () => {
      const clerk = window.Clerk;
      if (!clerk) return;

      await clerk.load();

      document.getElementById("loading").style.display = "none";

      if (!clerk.session) {
        // Not signed in — redirect to Clerk hosted sign-in, then come back
        const signinView = document.getElementById("signin-view");
        signinView.style.display = "block";

        clerk.redirectToSignIn({
          afterSignInUrl: window.location.href,
          afterSignUpUrl: window.location.href,
        });
        return;
      }

      // Already signed in — show consent screen
      showConsent();

      function showConsent() {
        document.getElementById("consent-view").style.display = "block";
        document.getElementById("app-name").textContent = CONFIG.clientName;
        document.getElementById("scope-display").textContent = CONFIG.scope;
      }

      document.getElementById("btn-deny").addEventListener("click", () => {
        const deny = new URL(CONFIG.redirectUri);
        deny.searchParams.set("error", "access_denied");
        if (CONFIG.state) deny.searchParams.set("state", CONFIG.state);
        window.location.href = deny.toString();
      });

      document.getElementById("btn-approve").addEventListener("click", async () => {
        const btn = document.getElementById("btn-approve");
        const errEl = document.getElementById("error-msg");
        btn.disabled = true;
        btn.textContent = "approving...";
        errEl.style.display = "none";

        try {
          const sessionToken = await clerk.session.getToken();

          const res = await fetch("/oauth/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: CONFIG.clientId,
              redirect_uri: CONFIG.redirectUri,
              code_challenge: CONFIG.codeChallenge,
              scope: CONFIG.scope,
              state: CONFIG.state,
              resource: CONFIG.resource,
              session_token: sessionToken,
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error_description || data.error || "Authorization failed");
          }

          window.location.href = data.redirect;
        } catch (err) {
          errEl.textContent = err.message;
          errEl.style.display = "block";
          btn.disabled = false;
          btn.textContent = "approve";
        }
      });
    });
  </script>
</body>
</html>`
  );
});

// POST /oauth/approve — verifies Clerk session, generates auth code, returns redirect
authorize.post("/oauth/approve", async (c) => {
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid_request", error_description: "Invalid request body" }, 400);
  }

  const {
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    scope,
    state,
    resource,
    session_token: sessionToken,
  } = body as {
    client_id?: string;
    redirect_uri?: string;
    code_challenge?: string;
    scope?: string;
    state?: string;
    resource?: string;
    session_token?: string;
  };

  if (!clientId || !redirectUri || !codeChallenge || !sessionToken) {
    return c.json({
      error: "invalid_request",
      error_description: "Missing required fields: client_id, redirect_uri, code_challenge, session_token",
    }, 400);
  }

  // Verify Clerk session token
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    return c.json({ error: "server_error", error_description: "Server misconfiguration" }, 500);
  }

  let clerkId: string;
  try {
    const payload = await verifyToken(sessionToken, {
      secretKey: clerkSecretKey,
      authorizedParties: [getApiBaseUrl()],
      clockSkewInMs: 10_000,
    });
    clerkId = payload.sub;
  } catch (err) {
    console.error("Clerk verifyToken failed:", err);
    return c.json({ error: "access_denied", error_description: "Invalid session token" }, 403);
  }

  if (!clerkId) {
    return c.json({ error: "access_denied", error_description: "Invalid session token" }, 403);
  }

  // Validate client and redirect URI
  const client = await prisma.oAuthClient.findUnique({
    where: { clientId },
  });

  if (!client) {
    return c.json({ error: "invalid_client", error_description: "Unknown client_id" }, 400);
  }

  if (!client.redirectUris.includes(redirectUri)) {
    return c.json({ error: "invalid_request", error_description: "redirect_uri not registered for this client" }, 400);
  }

  // Find or create user by clerkId
  let user = await prisma.user.findUnique({
    where: { clerkId },
  });

  if (!user) {
    const info = await fetchClerkUserInfo(clerkId);
    user = await prisma.user.create({
      data: {
        clerkId,
        displayName: info.displayName ?? (info.email ? displayNameFromEmail(info.email) : "there"),
        email: info.email,
        credits: SIGNUP_BONUS,
      },
    });
    triggerWelcomeEmail(user.id, user.displayName).catch(() => {});
  } else {
    // Backfill missing email or stale displayName for existing users
    const needsEmail = !user.email;
    const needsName = user.displayName === "Unknown";
    if (needsEmail || needsName) {
      const info = await fetchClerkUserInfo(clerkId);
      const updates: { email?: string; displayName?: string } = {};
      if (needsEmail && info.email) updates.email = info.email;
      if (needsName && info.displayName) updates.displayName = info.displayName;
      else if (needsName && info.email) updates.displayName = displayNameFromEmail(info.email);
      else if (needsName && user.email) updates.displayName = displayNameFromEmail(user.email);
      if (Object.keys(updates).length > 0) {
        user = await prisma.user.update({ where: { id: user.id }, data: updates });
      }
    }
  }

  const resolvedScope = scope ?? "mcp:tools";
  const scopeTokens = resolvedScope.split(" ").filter(Boolean);
  if (scopeTokens.some((s) => !SUPPORTED_SCOPES.includes(s))) {
    return c.json({
      error: "invalid_scope",
      error_description: "Unsupported scope. Supported: mcp:tools",
    }, 400);
  }

  // Generate auth code and store hash
  // RFC 8707 §5.1: resource parameter is OPTIONAL in the authorization request.
  // §5.3: if included in auth request, client MUST include it in token request.
  // We store null when the client doesn't provide it — no audience binding.
  const resolvedResource = resource || null;
  const code = generateAuthCode();

  await prisma.oAuthAuthorizationCode.create({
    data: {
      code: hashToken(code),
      clientId,
      userId: user.id,
      redirectUri,
      codeChallenge,
      scopes: resolvedScope.split(" "),
      resource: resolvedResource,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL),
    },
  });

  // Build redirect URL with code and optional state
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  return c.json({ redirect: redirectUrl.toString() });
});

export { authorize };
