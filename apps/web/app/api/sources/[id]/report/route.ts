import { requireUser } from "@/modules/auth/service";
import { audit, errors } from "@/modules/platform/service";
import { requestVerification } from "@/modules/research/service";
import { handle, intId } from "../../../_lib/respond";

/** "Report a broken link" (E.3 §5): recorded in the audit log and re-checked right away by the verifier (P3-core). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const id = intId((await ctx.params).id);
  if (!id) return errors.notFound();
  return handle(async () => {
    await audit(g.user.id, "source.report_broken", `source:${id}`);
    const { jobId } = await requestVerification(g.user.id, id);
    return { reported: true, recheckJobId: jobId };
  }, 201);
}
