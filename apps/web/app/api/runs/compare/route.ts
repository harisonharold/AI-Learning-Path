import { requireUser } from "@/modules/auth/service";
import { errors } from "@/modules/platform/service";
import { compareRuns } from "@/modules/research/service";
import { handle } from "../../_lib/respond";

/** GET /api/runs/compare?ids=1,2&metric=latency_ms — bootstrap CIs via api-py; degrades to stored summaries (AT-47). */
export async function GET(req: Request) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  const u = new URL(req.url);
  const ids = (u.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const metric = u.searchParams.get("metric") ?? "";
  if (!ids.every((i) => /^[1-9][0-9]{0,15}$/.test(i)) || !/^[a-z][a-z0-9_.]{0,63}$/.test(metric)) return errors.notFound();
  return handle(() => compareRuns(g.user.id, ids.map(Number), metric));
}
