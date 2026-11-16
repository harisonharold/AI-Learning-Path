import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { submitArtifact, submitQuiz } from "@/modules/learning/service";
import { errors } from "@/modules/platform/service";
import { body, handle } from "../../../_lib/respond";

// The browser can submit artifact links and quiz answers. It cannot submit test results:
// objective results come from atlas-lab (P2) or server grading, never from the client (D-15).
const Body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("artifact"), kind: z.enum(["report", "recording", "github_commit"]), url: z.url().max(500).refine((u) => u.startsWith("https://"), "must be https"), commitSha: z.string().regex(/^[0-9a-f]{40}$/).optional() }).strict(),
  z.object({ type: z.literal("quiz"), quiz: z.string().regex(/^[a-z0-9-]{1,64}$/), answers: z.record(z.string(), z.number().int().min(0).max(20).nullable()), viaDiagnostic: z.boolean().optional() }).strict(),
]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!/^[a-z0-9-]{1,64}$/.test(id)) return errors.notFound();
  const b = await body(req, Body);
  if ("response" in b) return b.response;
  const d = b.data;
  return handle(() => (d.type === "quiz"
    ? submitQuiz(g.user.id, id, d.quiz, d.answers, d.viaDiagnostic ? "diagnostic" : "manual")
    : submitArtifact(g.user.id, id, { kind: d.kind, url: d.url, commitSha: d.commitSha })), 201);
}
