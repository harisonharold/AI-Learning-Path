import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { reviewCard } from "@/modules/learning/service";
import { errors } from "@/modules/platform/service";
import { body, handle, intId } from "../../../_lib/respond";

const Body = z.object({ rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const id = intId((await ctx.params).id);
  if (!id) return errors.notFound();
  const b = await body(req, Body);
  if ("response" in b) return b.response;
  return handle(() => reviewCard(g.user.id, id, b.data.rating));
}
