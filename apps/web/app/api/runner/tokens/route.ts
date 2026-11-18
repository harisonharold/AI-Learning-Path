import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { createRunnerToken, listRunnerTokens, MAX_TOKEN_DAYS, RUNNER_SCOPES } from "@/modules/platform/service";
import { body, handle } from "../../_lib/respond";

const Body = z.object({ scopes: z.array(z.enum(RUNNER_SCOPES)).min(1).max(2), days: z.number().int().min(1).max(MAX_TOKEN_DAYS) }).strict();

export async function GET(req: Request) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  return handle(async () => ({ tokens: await listRunnerTokens(g.user.id) }));
}

/** Creates a runner token. The plaintext is returned once and never stored (AT-18). */
export async function POST(req: Request) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const b = await body(req, Body);
  if ("response" in b) return b.response;
  return handle(() => createRunnerToken(g.user.id, b.data.scopes, b.data.days), 201);
}
