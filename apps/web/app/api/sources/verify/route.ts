import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { apiError, rateLimit } from "@/modules/platform/service";
import { requestVerification } from "@/modules/research/service";
import { body, handle } from "../../_lib/respond";

const Body = z.object({ sourceId: z.number().int().positive() }).strict();

/** Re-check one source now. Only a known source id is accepted, never a URL from the body; worker-node fetches it
 * through the SSRF guard (D-17). Rate-limited so the button can't be used to flood the verifier. */
export async function POST(req: Request) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const b = await body(req, Body);
  if ("response" in b) return b.response;
  const limited = await rateLimit(`verify:${g.user.id}`, 30, 600);
  if (limited === "limited") return apiError(429, "RATE_LIMITED", "Too many re-checks; wait a few minutes.");
  if (limited === "unavailable") return apiError(503, "UNAVAILABLE", "Rate limiter unavailable; try again shortly.");
  return handle(() => requestVerification(g.user.id, b.data.sourceId), 202);
}
