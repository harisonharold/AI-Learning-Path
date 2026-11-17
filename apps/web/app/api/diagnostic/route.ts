import { requireUser } from "@/modules/auth/service";
import { diagnosticState } from "@/modules/learning/service";
import { handle } from "../_lib/respond";

/** Diagnostic items (answers stripped) and the saved session, for resume after a pause. */
export async function GET(req: Request) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  return handle(() => diagnosticState(g.user.id));
}
