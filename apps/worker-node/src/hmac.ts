import { createHash, createHmac, randomBytes } from "node:crypto";

/** Same internal signing scheme as web and worker-py (PLAN D-16); checked against packages/contracts/hmac-vectors.json. */
export const HEADERS = { ts: "x-atlas-timestamp", nonce: "x-atlas-nonce", sig: "x-atlas-signature" } as const;

export function signature(key: string, method: string, path: string, ts: string, nonce: string, body: string): string {
  const canonical = [method.toUpperCase(), path, ts, nonce, createHash("sha256").update(body).digest("hex")].join("\n");
  return createHmac("sha256", key).update(canonical).digest("hex");
}

export function signRequest(key: string, method: string, path: string, body: string, now = Date.now()): Record<string, string> {
  const ts = String(Math.floor(now / 1000));
  const nonce = randomBytes(16).toString("base64url");
  return { [HEADERS.ts]: ts, [HEADERS.nonce]: nonce, [HEADERS.sig]: signature(key, method, path, ts, nonce, body) };
}

/** POST a signed body to web's internal API (worker-node never touches the database). */
export async function postInternal(webUrl: string, key: string, path: string, body: unknown): Promise<Response> {
  const raw = JSON.stringify(body);
  return fetch(new URL(path, webUrl), { method: "POST", body: raw, headers: { "content-type": "application/json", ...signRequest(key, "POST", path, raw) }, signal: AbortSignal.timeout(15_000) });
}
