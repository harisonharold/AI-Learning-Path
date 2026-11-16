import { NextResponse } from "next/server";
import { requireUser } from "@/modules/auth/service";
import { errors, getJob } from "@/modules/platform/service";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return errors.notFound();
  const job = await getJob(id);
  if (!job) return errors.notFound();
  if (job.userId !== g.user.id) return errors.forbidden();
  const { payloadJson: _p, ...rest } = job;
  return NextResponse.json(rest);
}
