import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { saveDiagnostic } from "@/modules/learning/service";
import { body, handle } from "../../_lib/respond";

const Answer = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mcq"), choice: z.number().int().min(0).max(20).nullable() }).strict(),
  z.object({ kind: z.literal("short_answer"), text: z.string().max(4000), selfLevel: z.enum(["missing", "partial", "competent", "strong"]).nullable() }).strict(),
  z.object({ kind: z.literal("code"), practicePassed: z.boolean().nullable() }).strict(),
  z.object({ kind: z.literal("idk") }).strict(),
]);
const Body = z.object({ answers: z.record(z.string().max(64), Answer), index: z.number().int().min(0).max(200), pausedMs: z.number().int().min(0), complete: z.boolean(), hoursPerWeek: z.union([z.literal(20), z.literal(30), z.literal(40), z.literal(50)]).optional() }).strict();

/** Autosave (complete=false) and finish (complete=true). */
export async function POST(req: Request) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const b = await body(req, Body);
  if ("response" in b) return b.response;
  return handle(() => saveDiagnostic(g.user.id, b.data));
}
