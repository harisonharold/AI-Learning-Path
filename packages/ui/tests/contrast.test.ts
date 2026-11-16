import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/tokens.css", import.meta.url), "utf8");

function block(selector: RegExp): Record<string, string> {
  const m = css.match(selector);
  if (!m) throw new Error(`block not found: ${selector}`);
  const vars: Record<string, string> = {};
  for (const [, k, v] of m[1]!.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) vars[k!] = v!;
  return vars;
}
function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

const themes = { light: block(/:root \{([\s\S]*?)\n\}/), dark: block(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/) };
const TEXT = ["ink", "ink-muted", "accent", "verified", "self", "ai", "stale", "danger", "amber"];
const UI = ["border", "focus"];

describe.each(Object.entries(themes))("%s theme contrast (WCAG 2.2 AA)", (_name, t) => {
  for (const bg of ["bg", "surface", "surface-2"]) {
    it.each(TEXT)(`text --%s on --${bg} >= 4.5:1`, (fg) => expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5));
    it.each(UI)(`UI --%s on --${bg} >= 3:1`, (fg) => expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3));
  }
  it("mock text on mock background >= 4.5:1", () => expect(ratio(t.mock!, t["mock-bg"]!)).toBeGreaterThanOrEqual(4.5));
  it("accent-ink on accent >= 4.5:1", () => expect(ratio(t["accent-ink"]!, t.accent!)).toBeGreaterThanOrEqual(4.5));
});

it("dark tokens are identical in the media query and the explicit [data-theme=dark] block", () => {
  expect(block(/:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n  \}/)).toEqual(themes.dark);
});
