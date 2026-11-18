import { requireUser } from "@/modules/auth/service";
import { errors } from "@/modules/platform/service";
import { requestReport } from "@/modules/research/service";
import { handle, intId } from "../../../_lib/respond";

/** AT-19: 409 with reasons until the baseline rule holds; otherwise 202 and a render job. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const id = intId((await ctx.params).id);
  if (!id) return errors.notFound();
  return handle(() => requestReport(g.user.id, id), 202);
}
