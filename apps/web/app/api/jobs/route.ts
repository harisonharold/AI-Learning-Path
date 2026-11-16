import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { enqueueJob, errors, listJobs } from "@/modules/platform/service";

const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });
const Create = z.object({ kind: z.literal("diag.echo"), input: z.object({ message: z.string().max(200) }).strict() }).strict();

export async function GET(req: Request) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  const q = ListQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return errors.invalid(q.error.issues);
  const rows = await listJobs(g.user.id, q.data.limit);
  return NextResponse.json({ items: rows.map(({ payloadJson: _p, ...r }) => r), nextCursor: null });
}

/** Settings > Jobs "run diagnostic job": proves the web -> Redis -> worker-py -> HMAC callback path (AT-05). */
export async function POST(req: Request) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const body = Create.safeParse(await req.json().catch(() => null));
  if (!body.success) return errors.invalid(body.error.issues);
  const id = await enqueueJob(g.user.id, body.data.kind, body.data.input);
  return NextResponse.json({ id, status: "queued" }, { status: 202 });
}
