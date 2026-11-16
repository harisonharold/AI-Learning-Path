import { NextResponse } from "next/server";
import { requireUser } from "@/modules/auth/service";

export async function GET(req: Request) {
  const g = await requireUser(req);
  if ("response" in g) return g.response;
  return NextResponse.json({ user: g.user }, { headers: { "cache-control": "no-store" } });
}
