import { NextResponse } from "next/server";
import { requireUser } from "@/modules/auth/service";
import { errors } from "@/modules/platform/service";
import { reportFile } from "@/modules/research/service";
import { handle, intId } from "../../_lib/respond";

/** Report download. Always an attachment (never rendered on the app origin); HTML is built from escaped text only. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  const id = intId((await ctx.params).id);
  if (!id) return errors.notFound();
  const format = new URL(req.url).searchParams.get("format") === "html" ? "html" : "md";
  let file: Awaited<ReturnType<typeof reportFile>> | undefined;
  const res = await handle(async () => (file = await reportFile(g.user.id, id, format)));
  if (!file) return res;
  return new NextResponse(file.body, {
    headers: { "content-type": format === "html" ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${file.filename}"`,
      "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", "cache-control": "no-store" },
  });
}
