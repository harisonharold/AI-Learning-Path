import { requireUser } from "@/modules/auth/service";
import { lesson } from "@/modules/learning/service";
import { errors } from "@/modules/platform/service";
import { handle } from "../../_lib/respond";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return errors.notFound();
  return handle(() => lesson(g.user.id, slug));
}
