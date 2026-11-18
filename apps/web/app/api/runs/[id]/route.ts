import { NextResponse } from "next/server";
import { requireUser } from "@/modules/auth/service";
import { errors } from "@/modules/platform/service";
import { runExport } from "@/modules/research/service";
import { handle, intId } from "../../_lib/respond";

/** Raw data download for one run (F.6): samples, server and client summaries, environment, GPU timeline. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  const id = intId((await ctx.params).id);
  if (!id) return errors.notFound();
  const res = await handle(() => runExport(g.user.id, id));
  if (res.status !== 200 || new URL(req.url).searchParams.get("download") !== "1") return res;
  return new NextResponse(res.body, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="run-${id}.json"`, "cache-control": "no-store" } });
}
