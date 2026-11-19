import { NextResponse } from "next/server";
import { apiError, getEnv, log, redisNonceStore, verifyRequest } from "@/modules/platform/service";
import { sweep } from "@/modules/research/service";

/** Nightly re-verification trigger from worker-node's schedule. HMAC + timestamp + nonce; blocked at Caddy (X-02). */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 10_000) return apiError(413, "TOO_LARGE", "Body too large.");
  const path = new URL(req.url).pathname;
  const v = await verifyRequest(getEnv().INTERNAL_HMAC_KEY, redisNonceStore(), { method: "POST", path, headers: (n) => req.headers.get(n), body: raw });
  if (!v.ok) {
    log("warn", "internal sweep rejected", { reason: v.reason });
    return v.reason === "nonce_store_unavailable"
      ? apiError(503, "NONCE_STORE_UNAVAILABLE", "Replay protection unavailable; refusing request.")
      : apiError(401, "BAD_SIGNATURE", "Request signature rejected.", { reason: v.reason });
  }
  return NextResponse.json(await sweep());
}
