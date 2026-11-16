import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { addLessonCards } from "@/modules/learning/service";
import { body, handle } from "../_lib/respond";

const Body = z.object({ lesson: z.string().regex(/^[a-z0-9-]{1,64}$/) }).strict();

/** "Add must-know cards to my deck" from a lesson. */
export async function POST(req: Request) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const b = await body(req, Body);
  if ("response" in b) return b.response;
  return handle(() => addLessonCards(g.user.id, b.data.lesson), 201);
}
