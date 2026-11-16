import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, completeJob, errors, getEnv, log, redisNonceStore, verifyRequest } from "@/modules/platform/service";

const Body = z
  .object({ status: z.enum(["done", "failed"]), result: z.unknown().optional(), error: z.string().max(4000).nullable().optional(), attempts: z.number().int().min(0).max(50) })
  .strict();

/** worker-py callback. HMAC + timestamp + nonce (D-16). Blocked at Caddy for the public internet (X-02). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const raw = await req.text();
  if (raw.length > 1_000_000) return apiError(413, "TOO_LARGE", "Callback body too large.");
  const path = new URL(req.url).pathname;
  const v = await verifyRequest(getEnv().INTERNAL_HMAC_KEY, redisNonceStore(), { method: "POST", path, headers: (n) => req.headers.get(n), body: raw });
  if (!v.ok) {
    log("warn", "internal callback rejected", { reason: v.reason, path });
    return v.reason === "nonce_store_unavailable"
      ? apiError(503, "NONCE_STORE_UNAVAILABLE", "Replay protection unavailable; refusing request.")
      : apiError(401, "BAD_SIGNATURE", "Request signature rejected.", { reason: v.reason });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return apiError(400, "BAD_JSON", "Body is not JSON.");
  }
  const body = Body.safeParse(json);
  if (!body.success) return errors.invalid(body.error.issues);
  const { id } = await ctx.params;
  const applied = await completeJob(id, body.data.status, body.data.result, body.data.error ?? null, body.data.attempts);
  if (!applied) return apiError(409, "JOB_NOT_OPEN", "Job is unknown or already finished.");
  return NextResponse.json({ ok: true });
}
