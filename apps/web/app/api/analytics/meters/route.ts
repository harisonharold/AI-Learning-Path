import { requireUser } from "@/modules/auth/service";
import { meters } from "@/modules/learning/service";
import { handle } from "../../_lib/respond";

/** P1 returns the learning-progress meter; the other three meters arrive in P6 and are never merged with it. */
export async function GET(req: Request) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  return handle(() => meters(g.user.id));
}
