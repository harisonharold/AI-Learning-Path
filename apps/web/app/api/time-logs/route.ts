import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { logTime } from "@/modules/learning/service";
import { body, handle } from "../_lib/respond";

// Time is shown and used for the calendar estimate only. It never unlocks anything (AT-06).
const Body = z.object({ weekId: z.string().regex(/^(RI-W\d{2}|ACC-\d{2})$/), minutes: z.number().int().min(1).max(16 * 60), category: z.enum(["theory", "exercise", "lab", "experiment", "reading", "retrieval", "report"]), source: z.enum(["timer", "manual"]) }).strict();

export async function POST(req: Request) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const b = await body(req, Body);
  if ("response" in b) return b.response;
  return handle(() => logTime(g.user.id, b.data.weekId, b.data.minutes, b.data.category, b.data.source), 201);
}
