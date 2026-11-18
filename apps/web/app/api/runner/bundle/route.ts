import { gateBundle } from "@/modules/learning/service";
import { errors, requireRunner } from "@/modules/platform/service";
import { handle } from "../../_lib/respond";

/** GET /api/runner/bundle?ref=atlas-lab:w01@1 (or ?exercise=ex-w01-log-levels) — hidden gate tests for atlas-lab (scope tests:read). Never browser-reachable
 * with a session: only a runner token works here (X-06). */
export async function GET(req: Request) {
  const a = await requireRunner(req, "tests:read");
  if ("response" in a) return a.response;
  const q = new URL(req.url).searchParams;
  const ref = q.get("ref");
  const exercise = q.get("exercise");
  if (ref && /^atlas-lab:[a-z0-9-]+@[0-9]+$/.test(ref)) return handle(async () => gateBundle({ ref }));
  if (exercise && /^[a-z0-9-]{1,64}$/.test(exercise)) return handle(async () => gateBundle({ exercise }));
  return errors.notFound();
}
