import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { errors } from "@/modules/platform/service";
import { patchProject, project } from "@/modules/research/service";
import { body, handle, intId } from "../../_lib/respond";

const Prereg = z.object({
  primary_metric: z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/, "must be a metric name as uploaded, e.g. latency_ms"),
  baseline_desc: z.string().trim().min(3).max(500),
  stopping_rule: z.string().trim().min(3).max(500),
  min_repetitions: z.number().int().min(2).max(100),
}).strict();

const Body = z.object({
  title: z.string().trim().min(3).max(300).optional(),
  hypothesis: z.string().max(5000).optional(),
  planMd: z.string().max(100_000).optional(),
  amendment: z.string().trim().min(3).max(5000).optional(),
  prereg: Prereg.optional(),
  status: z.enum(["draft", "running", "concluded", "abandoned"]).optional(),
}).strict();

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  const id = intId((await ctx.params).id);
  if (!id) return errors.notFound();
  return handle(() => project(g.user.id, id));
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const id = intId((await ctx.params).id);
  if (!id) return errors.notFound();
  const b = await body(req, Body);
  if ("response" in b) return b.response;
  return handle(() => patchProject(g.user.id, id, b.data));
}
