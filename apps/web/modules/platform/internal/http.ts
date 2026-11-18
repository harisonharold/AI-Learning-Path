import { NextResponse } from "next/server";
import type { z } from "zod";

/** The single error shape (G §4): {error:{code,message,details}}. */
export function apiError(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, details } }, { status, headers: { "cache-control": "no-store" } });
}

export const errors = {
  unauthenticated: () => apiError(401, "UNAUTHENTICATED", "Sign in required."),
  forbidden: () => apiError(403, "FORBIDDEN", "You do not have access to this resource."),
  notFound: () => apiError(404, "NOT_FOUND", "Not found."),
  badOrigin: () => apiError(403, "BAD_ORIGIN", "Cross-origin request refused."),
  invalid: (issues: z.core.$ZodIssue[]) =>
    apiError(422, "VALIDATION_FAILED", "Request failed validation.", {
      fields: issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    }),
};

/** CSRF defence for state-changing requests: Origin (or Sec-Fetch-Site) must match the app origin. */
export function sameOrigin(req: Request, appOrigin: string): boolean {
  const origin = req.headers.get("origin");
  if (origin) return origin === appOrigin;
  const site = req.headers.get("sec-fetch-site");
  return site === "same-origin";
}

/** Reads a request body as text, aborting as soon as it exceeds `max` bytes (streamed check, no full buffering). */
export async function readBodyLimited(req: Request, max: number): Promise<{ text: string; bytes: Buffer } | { response: Response }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  const tooLarge = () => apiError(413, "TOO_LARGE", `Upload exceeds ${Math.round(max / 1024 / 1024)} MB.`, { maxBytes: max });
  if (declared > max) return { response: tooLarge() };
  if (!req.body) return { text: "", bytes: Buffer.alloc(0) };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return { response: tooLarge() };
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  return { text: bytes.toString("utf8"), bytes };
}
