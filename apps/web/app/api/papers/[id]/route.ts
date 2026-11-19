import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { errors } from "@/modules/platform/service";
import { patchPaper } from "@/modules/research/service";
import { body, handle, intId } from "../../_lib/respond";

const Body = z.object({ userNotes: z.string().max(200_000).optional(), status: z.enum(["to_read", "read", "analysed"]).optional() }).strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const id = intId((await ctx.params).id);
  if (!id) return errors.notFound();
  const b = await body(req, Body);
  if ("response" in b) return b.response;
  return handle(() => patchPaper(g.user.id, id, b.data));
}
