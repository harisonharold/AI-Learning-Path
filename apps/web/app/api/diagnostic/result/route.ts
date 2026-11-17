import { requireUser } from "@/modules/auth/service";
import { diagnosticResult } from "@/modules/learning/service";
import { errors } from "@/modules/platform/service";
import { handle } from "../../_lib/respond";

export async function GET(req: Request) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  const r = await diagnosticResult(g.user.id);
  return r ? handle(async () => r) : errors.notFound();
}
