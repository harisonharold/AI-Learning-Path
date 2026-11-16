import { createHmac, randomBytes } from "node:crypto";
import { safeEqualHex, sha256Hex } from "./crypto.ts";

/**
 * Internal request signing (PLAN D-16). Same algorithm in services/common/atlas_common/hmac.py;
 * both are checked against packages/contracts/hmac-vectors.json.
 *   signature = hex(HMAC-SHA256(key, METHOD \n path \n timestamp \n nonce \n hex(sha256(body))))
 */
export const HMAC_MAX_SKEW_SECONDS = 300;
export const NONCE_TTL_SECONDS = 600;
export const HEADERS = { ts: "x-atlas-timestamp", nonce: "x-atlas-nonce", sig: "x-atlas-signature" } as const;

export function canonical(method: string, path: string, ts: string, nonce: string, body: string | Buffer): string {
  return [method.toUpperCase(), path, ts, nonce, sha256Hex(body)].join("\n");
}

export function signature(key: string, method: string, path: string, ts: string, nonce: string, body: string | Buffer): string {
  return createHmac("sha256", key).update(canonical(method, path, ts, nonce, body)).digest("hex");
}

export function signRequest(key: string, method: string, path: string, body: string, now = Date.now()) {
  const ts = String(Math.floor(now / 1000));
  const nonce = randomBytes(16).toString("base64url");
  return { [HEADERS.ts]: ts, [HEADERS.nonce]: nonce, [HEADERS.sig]: signature(key, method, path, ts, nonce, body) };
}

/** Records a nonce; returns false if it was already used. Must throw if the store is unavailable (fail closed). */
export interface NonceStore {
  claim(nonce: string, ttlSeconds: number): Promise<boolean>;
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing_headers" | "bad_timestamp" | "stale" | "bad_signature" | "replayed" | "nonce_store_unavailable" };

export async function verifyRequest(
  key: string,
  store: NonceStore,
  req: { method: string; path: string; headers: (name: string) => string | null; body: string },
  now = Date.now(),
): Promise<VerifyResult> {
  const ts = req.headers(HEADERS.ts);
  const nonce = req.headers(HEADERS.nonce);
  const sig = req.headers(HEADERS.sig);
  if (!ts || !nonce || !sig) return { ok: false, reason: "missing_headers" };
  if (!/^\d{1,12}$/.test(ts) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) {
    return { ok: false, reason: "bad_timestamp" };
  }
  if (Math.abs(Math.floor(now / 1000) - Number(ts)) > HMAC_MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };
  // Signature before nonce claim, so unsigned junk can't burn nonces.
  if (!safeEqualHex(signature(key, req.method, req.path, ts, nonce, req.body), sig)) return { ok: false, reason: "bad_signature" };
  let fresh: boolean;
  try {
    fresh = await store.claim(nonce, NONCE_TTL_SECONDS);
  } catch {
    return { ok: false, reason: "nonce_store_unavailable" };
  }
  return fresh ? { ok: true } : { ok: false, reason: "replayed" };
}
