import { describe, expect, it } from "vitest";
import { hasCycle, validateContent } from "../internal/content-schema.ts";
import { content } from "./helpers.ts";

describe("content pipeline", () => {
  it("loads and validates the repo content", () => {
    expect(content.curriculum.ri_weeks).toHaveLength(24);
    expect(content.curriculum.acc_weeks).toHaveLength(16);
    expect(validateContent(content)).toEqual([]);
  });
  it("each P1 lesson ships 15 must-know cards (B.4: 15-30)", () => {
    for (const l of content.lessons) expect(l.cards.length, l.slug).toBeGreaterThanOrEqual(15);
  });
  it("every ACC week maps to RI weeks; W21 is optional in ACC", () => {
    const mapped = content.curriculum.acc_weeks.flatMap((a) => a.ri);
    expect(mapped).not.toContain("RI-W21");
    expect(new Set(mapped).size).toBe(23);
  });
  it("weeks 1-12 are no-AI-code weeks; 13+ are not (G §6.1)", () => {
    for (const w of content.curriculum.ri_weeks) expect(w.no_ai_code, w.id).toBe(w.ordinal <= 12);
  });
  it("course-policy weeks are publish-restricted (X-09 groundwork)", () => {
    expect(content.curriculum.ri_weeks.filter((w) => w.publish_restricted).map((w) => w.id)).toEqual(["RI-W08", "RI-W09", "RI-W10", "RI-W11", "RI-W12"]);
  });
  it("every external source has a URL and verified_at, or is explicitly unverified", () => {
    for (const s of content.sources) {
      expect(s.url).toMatch(/^https:\/\//);
      if (s.verification === "unverified") expect(s.verified_at).toBeNull();
      else expect(s.verified_at).toBeInstanceOf(Date);
    }
  });
  it("detects cycles and dangling references", () => {
    expect(hasCycle([["a", "b"], ["b", "a"]])).toBe(true);
    expect(hasCycle([["a", "b"], ["b", "c"]])).toBe(false);
    const broken = { ...content, lessons: [{ ...content.lessons[0]!, resources: ["nope"] }] };
    expect(validateContent(broken)).toContain("lesson w01-tooling: unknown source nope");
  });
});
