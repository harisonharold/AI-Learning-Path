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
