import { createHash, randomBytes } from "node:crypto";

export const ACCESS_TOKEN_PREFIX = "ki_";
export const REFRESH_TOKEN_PREFIX = "kir_";
export const CLIENT_ID_PREFIX = "dyn_";

export const ACCESS_TOKEN_TTL = 60 * 60 * 1000;           // 1 hour
export const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
export const AUTH_CODE_TTL = 60 * 1000;                     // 60 seconds

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

export function generateClientId(): string {
  return `${CLIENT_ID_PREFIX}${randomBytes(16).toString("base64url")}`;
}

export function generateAuthCode(): string {
  return randomBytes(32).toString("base64url");
}

export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const expected = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return expected === codeChallenge;
}

export function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return true;
    }
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || `http://localhost:${process.env.API_PORT || 3001}`;
}
