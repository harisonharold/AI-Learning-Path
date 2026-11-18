import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db/client.ts";
import { runnerTokens } from "../../../db/schema/index.ts";
import { audit } from "./audit.ts";
import { sha256Hex } from "./crypto.ts";
import { apiError } from "./http.ts";

/**
 * atlas-lab runner tokens (FR-14, THREAT T-R1/T-R4, AT-18).
 * 32 random bytes, shown once, stored only as SHA-256; scoped, expiring (max 90 days), revocable; last use recorded.
 * Accepted only as `Authorization: Bearer ...`. Cookies are never read on runner routes, so CSRF does not apply.
 */
export const RUNNER_SCOPES = ["results:write", "tests:read"] as const;
export type RunnerScope = (typeof RUNNER_SCOPES)[number];
export const MAX_TOKEN_DAYS = 90;
const PREFIX = "atl_";
const TOKEN_RE = /^atl_[A-Za-z0-9_-]{43}$/;

export interface RunnerPrincipal { userId: string; tokenId: number; scopes: RunnerScope[] }

export async function createRunnerToken(userId: string, scopes: RunnerScope[], days: number, now = new Date()) {
  if (!Number.isInteger(days) || days < 1 || days > MAX_TOKEN_DAYS) throw new RangeError(`days must be 1..${MAX_TOKEN_DAYS}`);
  const token = PREFIX + randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + days * 86_400_000);
  const [res] = await getDb().insert(runnerTokens).values({
    userId, tokenPrefix: token.slice(0, 8), tokenHash: sha256Hex(token), scopes: [...new Set(scopes)], expiresAt,
  });
  const id = Number((res as { insertId: number | bigint }).insertId);
  await audit(userId, "runner_token.create", `runner_token:${id}`, { scopes, expiresAt: expiresAt.toISOString() });
  return { id, token, prefix: token.slice(0, 8), scopes, expiresAt };
}

export async function listRunnerTokens(userId: string) {
  const rows = await getDb().select().from(runnerTokens).where(eq(runnerTokens.userId, userId)).orderBy(desc(runnerTokens.createdAt));
  return rows.map(({ tokenHash: _hash, ...r }) => r);
}

export async function runnerTokenOwner(id: number) {
  return (await getDb().select({ userId: runnerTokens.userId }).from(runnerTokens).where(eq(runnerTokens.id, id)).limit(1))[0]?.userId;
}

export async function revokeRunnerToken(userId: string, id: number) {
  const res = await getDb().update(runnerTokens).set({ revoked: true }).where(and(eq(runnerTokens.id, id), eq(runnerTokens.userId, userId)));
  const ok = (res[0] as { affectedRows: number }).affectedRows === 1;
  if (ok) await audit(userId, "runner_token.revoke", `runner_token:${id}`);
  return ok;
}

const unauthorized = (reason: string) =>
  apiError(401, "BAD_RUNNER_TOKEN", "Runner token missing, invalid, expired or revoked. Create a new one in Settings and run `atlas-lab login`.", { reason });

/** Authenticates a runner request. Returns the principal or a 401/403 response. */
export async function requireRunner(req: Request, scope: RunnerScope, now = new Date()): Promise<{ runner: RunnerPrincipal } | { response: Response }> {
  const m = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m || !TOKEN_RE.test(m[1]!)) return { response: unauthorized("missing_or_malformed") };
  const db = getDb();
  const row = (await db.select().from(runnerTokens).where(eq(runnerTokens.tokenHash, sha256Hex(m[1]!))).limit(1))[0];
  if (!row) return { response: unauthorized("unknown") };
  if (row.revoked) return { response: unauthorized("revoked") };
  if (row.expiresAt <= now) return { response: unauthorized("expired") };
  const scopes = row.scopes as RunnerScope[];
  if (!scopes.includes(scope)) return { response: apiError(403, "SCOPE_REQUIRED", `This token lacks the ${scope} scope.`, { scope }) };
  await db.update(runnerTokens).set({ lastUsedAt: now }).where(eq(runnerTokens.id, row.id));
  return { runner: { userId: row.userId, tokenId: row.id, scopes } };
}
