import { requireUser } from "@/modules/auth/service";
import { revealHint } from "@/modules/learning/service";
import { errors } from "@/modules/platform/service";
import { handle } from "../../../_lib/respond";

/** Reveals the next hint (concept -> location -> pseudo-code) and records it on the attempt. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!/^[a-z0-9-]{1,64}$/.test(id)) return errors.notFound();
  return handle(() => revealHint(g.user.id, id));
}
