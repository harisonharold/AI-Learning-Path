import { requireUser } from "@/modules/auth/service";
import { today } from "@/modules/learning/service";
import { handle } from "../_lib/respond";

export async function GET(req: Request) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  return handle(() => today(g.user.id));
}
