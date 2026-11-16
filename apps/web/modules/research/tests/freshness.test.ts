import { describe, expect, it } from "vitest";
import { freshness } from "../internal/freshness.ts";

const now = new Date("2026-12-20T00:00:00Z");
describe("AT-12 (rule): stale after 30 days", () => {
  it("29 days old is fresh", () => expect(freshness({ verification: "verified", verifiedAt: new Date("2026-11-21T00:00:00Z") }, now)).toBe("fresh"));
  it("exactly 30 days old is still fresh", () => expect(freshness({ verification: "verified", verifiedAt: new Date("2026-11-20T00:00:00Z") }, now)).toBe("fresh"));
  it("31 days old is stale", () => expect(freshness({ verification: "verified", verifiedAt: new Date("2026-11-19T00:00:00Z") }, now)).toBe("stale"));
  it("the seed date 2026-11-16 goes stale on 2026-12-17", () => {
    expect(freshness({ verification: "verified", verifiedAt: new Date("2026-11-16T00:00:00Z") }, new Date("2026-12-16T00:00:00Z"))).toBe("fresh");
    expect(freshness({ verification: "verified", verifiedAt: new Date("2026-11-16T00:00:00Z") }, new Date("2026-12-17T00:00:00Z"))).toBe("stale");
  });
  it("unverified and broken are never fresh", () => {
    expect(freshness({ verification: "unverified", verifiedAt: null }, now)).toBe("unverified");
    expect(freshness({ verification: "broken", verifiedAt: new Date("2026-12-19T00:00:00Z") }, now)).toBe("broken");
    expect(freshness({ verification: "partial", verifiedAt: null }, now)).toBe("unverified");
  });
});
