import { recordRunnerResult } from "@/modules/learning/service";
import { apiError, errors, rateLimit, readBodyLimited, requireRunner } from "@/modules/platform/service";
import { ingestRun, MAX_UPLOAD_BYTES, RunnerUpload, sha256 } from "@/modules/research/service";
import { handle } from "../../_lib/respond";

/** atlas-lab upload (runner token, scope results:write). kind=benchmark stores a run; kind=gate_tests records
 * runner_result evidence for the gate that uses the bundle. Bearer token only: cookies are ignored here. */
export async function POST(req: Request) {
  const a = await requireRunner(req, "results:write");
  if ("response" in a) return a.response;
  const limited = await rateLimit(`runner:${a.runner.tokenId}`, 120, 600);
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
  const parsed = RunnerUpload.safeParse(json);
  if (!parsed.success) return errors.invalid(parsed.error.issues);
  const { userId, tokenId } = a.runner;
  const d = parsed.data;
  if (d.kind === "gate_tests") return handle(() => recordRunnerResult(userId, d), 201);
  const { kind: _k, ...upload } = d;
  return handle(() => ingestRun(userId, upload, { source: "runner", runnerTokenId: tokenId, uploadSha256: sha256(raw.bytes) }), 201);
}
