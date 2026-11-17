import { requireUser } from "@/modules/auth/service";
import { dueQuiz } from "@/modules/learning/service";
import { handle } from "../_lib/respond";

/** Today's retrieval quiz: due cards from weeks before the current one (AT-09). */
export async function GET(req: Request) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  return handle(() => dueQuiz(g.user.id));
}
