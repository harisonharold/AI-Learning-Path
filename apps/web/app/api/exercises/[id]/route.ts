import { requireUser } from "@/modules/auth/service";
import { exercise } from "@/modules/learning/service";
import { errors } from "@/modules/platform/service";
import { handle } from "../../_lib/respond";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!/^[a-z0-9-]{1,64}$/.test(id)) return errors.notFound();
  return handle(() => exercise(g.user.id, id));
}
