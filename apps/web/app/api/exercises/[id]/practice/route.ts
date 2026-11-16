import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { recordPractice } from "@/modules/learning/service";
import { errors } from "@/modules/platform/service";
import { body, handle } from "../../../_lib/respond";

// Results only, never code: the server does not receive or run learner code (AT-08). Stored as a practice check.
const Body = z.object({ passed: z.boolean(), tests: z.array(z.object({ name: z.string().max(200), passed: z.boolean(), message: z.string().max(2000).optional() }).strict()).max(100) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!/^[a-z0-9-]{1,64}$/.test(id)) return errors.notFound();
  const b = await body(req, Body);
  if ("response" in b) return b.response;
  return handle(() => recordPractice(g.user.id, id, b.data), 201);
}
