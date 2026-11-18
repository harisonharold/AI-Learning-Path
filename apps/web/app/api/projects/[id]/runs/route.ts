import { requireUser } from "@/modules/auth/service";
import { apiError, errors, rateLimit, readBodyLimited } from "@/modules/platform/service";
import { BenchmarkUpload, ingestRun, MAX_UPLOAD_BYTES, sha256 } from "@/modules/research/service";
import { handle, intId } from "../../../_lib/respond";

/** Session upload of a benchmark JSON (FR-13). Same contract as the runner upload; <= 20 MB, streamed size check. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const id = intId((await ctx.params).id);
  if (!id) return errors.notFound();
  const limited = await rateLimit(`upload:${g.user.id}`, 60, 600);
  if (limited === "limited") return apiError(429, "RATE_LIMITED", "Too many uploads; wait a few minutes.");
  if (limited === "unavailable") return apiError(503, "UNAVAILABLE", "Upload limiter unavailable; try again shortly.");
  const raw = await readBodyLimited(req, MAX_UPLOAD_BYTES);
  if ("response" in raw) return raw.response;
  let json: unknown;
  try {
    json = JSON.parse(raw.text);
  } catch {
    return apiError(422, "VALIDATION_FAILED", "Body is not valid JSON.", { fields: [{ path: "", message: "not JSON" }] });
  }
  const parsed = BenchmarkUpload.safeParse(json);
  if (!parsed.success) return errors.invalid(parsed.error.issues);
  if (parsed.data.project_id !== id) return errors.invalid([{ code: "custom", path: ["project_id"], message: "must match the project in the URL", input: parsed.data.project_id }]);
  return handle(() => ingestRun(g.user.id, parsed.data, { source: "upload", runnerTokenId: null, uploadSha256: sha256(raw.bytes) }), 201);
}
