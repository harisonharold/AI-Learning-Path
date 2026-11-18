import { gateBundle } from "@/modules/learning/service";
import { errors, requireRunner } from "@/modules/platform/service";
import { handle } from "../../_lib/respond";

/** GET /api/runner/bundle?ref=atlas-lab:w01@1 — hidden gate tests for atlas-lab (scope tests:read). Never browser-reachable
 * with a session: only a runner token works here (X-06). */
export async function GET(req: Request) {
  const a = await requireRunner(req, "tests:read");
  if ("response" in a) return a.response;
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  if (!/^atlas-lab:[a-z0-9-]+@[0-9]+$/.test(ref)) return errors.notFound();
  return handle(async () => gateBundle(ref));
}
