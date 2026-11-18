import { NextResponse } from "next/server";
import { requireRunner } from "@/modules/platform/service";

/** Used by `atlas-lab login` to check a token without uploading anything. */
export async function GET(req: Request) {
  const a = await requireRunner(req, "results:write");
  if ("response" in a) {
    // A tests:read-only token is still a valid login.
    const b = await requireRunner(req, "tests:read");
    if ("response" in b) return a.response;
    return NextResponse.json({ ok: true, scopes: b.runner.scopes });
  }
  return NextResponse.json({ ok: true, scopes: a.runner.scopes });
}
