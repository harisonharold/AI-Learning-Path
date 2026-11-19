import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { addPaper, papers } from "@/modules/research/service";
import { body, handle } from "../_lib/respond";

const Body = z.union([
  z.object({ arxivId: z.string().trim().min(5).max(40) }).strict(),
  z.object({ url: z.url().max(2000).refine((u) => /^https?:\/\//.test(u), "must be http(s)"), title: z.string().trim().min(3).max(500) }).strict(),
]);

/** GET /api/papers?q=… — the user's library, optionally FULLTEXT-searched over title, abstract and notes (AT-26). */
export async function GET(req: Request) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 200) ?? undefined;
  return handle(async () => ({ papers: await papers(g.user.id, q) }));
}

export async function POST(req: Request) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const b = await body(req, Body);
  if ("response" in b) return b.response;
  return handle(() => addPaper(g.user.id, b.data), 201);
}
