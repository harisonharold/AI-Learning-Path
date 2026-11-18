import { requireUser } from "@/modules/auth/service";
import { errors, revokeRunnerToken, runnerTokenOwner } from "@/modules/platform/service";
import { handle, intId } from "../../../_lib/respond";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const id = intId((await ctx.params).id);
  if (!id) return errors.notFound();
  const owner = await runnerTokenOwner(id);
  if (!owner) return errors.notFound();
  if (owner !== g.user.id) return errors.forbidden();
  return handle(async () => ({ revoked: await revokeRunnerToken(g.user.id, id) }));
}
