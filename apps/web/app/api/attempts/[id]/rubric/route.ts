import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { scoreRubric } from "@/modules/learning/service";
import { errors, rolesOf } from "@/modules/platform/service";
import { body, handle, intId } from "../../../_lib/respond";

// The scorer is derived from the session's role, never from the request (X-11, T-A10). There is no way to submit ai_suggested here.
const Body = z.object({ scores: z.array(z.object({ criterion: z.string().min(1).max(100), level: z.enum(["missing", "partial", "competent", "strong"]), note: z.string().max(2000).optional() }).strict()).min(1).max(20) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const id = intId((await ctx.params).id);
  if (!id) return errors.notFound();
  const b = await body(req, Body);
  if ("response" in b) return b.response;
  const roles = await rolesOf(g.user.id);
  return handle(() => scoreRubric(g.user.id, id, roles.has("reviewer") ? "reviewer" : "self", b.data.scores));
}
