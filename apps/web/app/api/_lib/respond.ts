import { NextResponse } from "next/server";
import type { z } from "zod";
import { LearningError } from "@/modules/learning/service";
import { apiError, errors, log } from "@/modules/platform/service";
import { ResearchError } from "@/modules/research/service";

const STATUS: Record<LearningError["code"], number> = { NOT_FOUND: 404, FORBIDDEN: 403, LOCKED: 409, REATTEMPT_WAIT: 409, ALREADY_PASSED: 409, INVALID: 422, NOT_AVAILABLE: 409 };

const RESEARCH_STATUS: Record<ResearchError["code"], number> = { NOT_FOUND: 404, FORBIDDEN: 403, INVALID: 422, NOT_AVAILABLE: 409, CONFLICT: 409 };

/** Runs a handler body and maps domain errors to the single error shape (G §4). */
export async function handle(fn: () => Promise<unknown>, status = 200): Promise<Response> {
  try {
    return NextResponse.json(await fn(), { status, headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof LearningError) return apiError(STATUS[e.code], e.code, e.message, e.details);
    if (e instanceof ResearchError) {
      // Validation problems keep the single field-error shape used by errors.invalid().
      if (e.code === "INVALID" && Array.isArray(e.details.fields)) return apiError(422, "VALIDATION_FAILED", e.message, e.details);
      return apiError(RESEARCH_STATUS[e.code], e.code, e.message, e.details);
    }
    log("error", "unhandled route error", { error: e instanceof Error ? e.message : String(e) });
    return apiError(500, "INTERNAL", "Something failed on the server. Your saved data is safe.");
  }
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<{ data: z.infer<T> } | { response: Response }> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  return parsed.success ? { data: parsed.data } : { response: errors.invalid(parsed.error.issues) };
}

export const intId = (s: string) => (/^[1-9][0-9]{0,15}$/.test(s) ? Number(s) : null);
