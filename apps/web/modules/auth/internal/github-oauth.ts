import "server-only";
/**
 * The ONLY code allowed to send a non-GET request to any GitHub host (reworded AT-27, PLAN D-13/D-18):
 * POST {token endpoint} for the authorization-code exchange. Token refresh uses the same endpoint (Q24)
 * and is issued by Better Auth's generic OAuth plugin configured in better-auth.ts, also inside modules/auth.
 * Lint forbids importing this file from outside modules/auth.
 */
import { isAllowedGitHubId } from "./allowlist.ts";

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  apiUrl: string;
  allowedId: string;
  onRejected: (githubId: string, login: string | null) => Promise<void>;
  fetchImpl?: typeof fetch;
}

export interface Tokens {
  tokenType?: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: Date;
  refreshTokenExpiresAt?: Date;
  scopes?: string[];
}

export async function exchangeCode(cfg: GitHubOAuthConfig, data: { code: string; redirectURI: string; codeVerifier?: string | undefined }): Promise<Tokens> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code: data.code,
    redirect_uri: data.redirectURI,
  });
  if (data.codeVerifier) body.set("code_verifier", data.codeVerifier);
  const res = await (cfg.fetchImpl ?? fetch)(cfg.tokenUrl, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body,
    redirect: "error",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    throw new Error(`GitHub token exchange failed (${res.status}${typeof json.error === "string" ? `: ${json.error}` : ""})`);
  }
  const now = Date.now();
  const secs = (v: unknown) => (typeof v === "number" && v > 0 ? new Date(now + v * 1000) : undefined);
  const t: Tokens = { tokenType: typeof json.token_type === "string" ? json.token_type : "bearer", accessToken: json.access_token };
  if (typeof json.refresh_token === "string") t.refreshToken = json.refresh_token;
  const a = secs(json.expires_in);
  if (a) t.accessTokenExpiresAt = a;
  const r = secs(json.refresh_token_expires_in);
  if (r) t.refreshTokenExpiresAt = r;
  if (typeof json.scope === "string" && json.scope) t.scopes = json.scope.split(",");
  return t;
}

export interface GitHubUserInfo {
  [key: string]: unknown;
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  login: string;
}

/** GET /user; returns null (sign-in refused, no rows written) unless the numeric id is the allowlisted one. */
export async function fetchAllowedUser(cfg: GitHubOAuthConfig, accessToken: string): Promise<GitHubUserInfo | null> {
  const res = await (cfg.fetchImpl ?? fetch)(`${cfg.apiUrl}/user`, {
    method: "GET",
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${accessToken}`, "user-agent": "systems-atlas" },
  });
  if (!res.ok) return null;
  const p = (await res.json()) as { id?: unknown; login?: unknown; name?: unknown; email?: unknown; avatar_url?: unknown };
  const login = typeof p.login === "string" ? p.login : null;
  if (!isAllowedGitHubId(p.id, cfg.allowedId)) {
    await cfg.onRejected(String(p.id ?? "unknown"), login);
    return null;
  }
  const id = String(p.id);
  // A GitHub App without the email permission may get email=null; use GitHub's no-reply form so no extra permission is needed.
  const email = typeof p.email === "string" && p.email ? p.email : `${id}+${login ?? "user"}@users.noreply.github.com`;
  const info: GitHubUserInfo = { id, login: login ?? id, name: typeof p.name === "string" && p.name ? p.name : (login ?? id), email, emailVerified: false };
  if (typeof p.avatar_url === "string") info.image = p.avatar_url;
  return info;
}
