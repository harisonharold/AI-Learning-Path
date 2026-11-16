import { NextResponse } from "next/server";
import { pingDb, pingRedis } from "@/modules/platform/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const [db, redis] = await Promise.all([pingDb(), pingRedis()]);
  const ok = db && redis;
  return NextResponse.json({ service: "web", ok, checks: { db, redis } }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
