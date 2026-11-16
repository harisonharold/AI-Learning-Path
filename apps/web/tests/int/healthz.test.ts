import { describe, expect, it } from "vitest";
import { testEnv } from "./helpers.ts";

testEnv();
const { GET } = await import("../../app/api/healthz/route.ts");

describe("AT-01 (web unit of it): /api/healthz", () => {
  it("is 200 with db and redis up", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ service: "web", ok: true, checks: { db: true, redis: true } });
  });
});
