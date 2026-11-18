import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { settings } from "@/modules/learning/service";
import { createProject, listProjects } from "@/modules/research/service";
import { body, handle } from "../_lib/respond";

const Body = z.object({ title: z.string().trim().min(3).max(300), hypothesis: z.string().max(5000).optional(), planMd: z.string().max(100_000).optional() }).strict();

export async function GET(req: Request) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  return handle(async () => ({ projects: await listProjects(g.user.id, (await settings(g.user.id)).sampleData) }));
}

export async function POST(req: Request) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const b = await body(req, Body);
  if ("response" in b) return b.response;
  return handle(() => createProject(g.user.id, b.data), 201);
}
