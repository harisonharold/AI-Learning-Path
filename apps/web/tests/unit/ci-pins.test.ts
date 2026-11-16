/** PLAN D-38: every third-party action in .github/workflows is pinned to a full 40-hex commit SHA. */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../../../../.github/workflows/", import.meta.url);
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));

describe("GitHub Actions are pinned to commit SHAs", () => {
  it("has at least one workflow", () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    const uses = [...readFileSync(new URL(f, dir), "utf8").matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map((m) => m[1]!);
    it.each(uses.filter((u) => !u.startsWith("./")))(`${f}: %s`, (u) => expect(u).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/));
  }
});
