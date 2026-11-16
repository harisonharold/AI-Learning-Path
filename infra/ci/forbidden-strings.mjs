#!/usr/bin/env node
/**
 * Honesty checks over shipped source (AT-42 from P0; AT-25 "novel" from P3).
 * Forbidden in app UI/source: recruiter scores, hiring probabilities, guarantees, and the word "novel".
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const roots = process.env.FORBIDDEN_ROOTS ? process.env.FORBIDDEN_ROOTS.split(",") : ["apps/web/app", "apps/web/components", "apps/web/modules", "packages/ui/src", "services", "apps/worker-node/src"];
const skip = /(node_modules|\.next|__pycache__|\.venv|\/tests?\/|\.test\.|_test\.py|test_)/;
const rules = [
  ["recruiter score", /recruiter[\s_-]*score/i],
  ["hire/interview/offer probability", /(probability|chance|likelihood|odds)\s+(of|to)\s+(getting\s+)?(hired|an?\s+interview|an?\s+offer|employ)/i],
  ["guarantee of outcomes", /guarantee[sd]?\s+(an?\s+)?(job|interview|offer|salary|placement)/i],
  ["salary prediction", /(expected|predicted|estimated)\s+salary/i],
  ['the word "novel" (UI must say "no prior work found in these searches")', /\bnovel\b/i],
  ["hiring score", /hiring[\s_-]*(score|probability)/i],
];

function* files(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (skip.test(p)) continue;
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(tsx?|py|mdx?|json)$/.test(f)) yield p;
  }
}
const findings = [];
for (const r of roots) for (const f of files(r)) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => { for (const [name, re] of rules) if (re.test(line)) findings.push(`${relative(".", f)}:${i + 1}: ${name}`); });
}
if (findings.length) { console.error("Forbidden strings found:\n" + findings.join("\n")); process.exit(1); }
console.log("forbidden-strings PASS");
