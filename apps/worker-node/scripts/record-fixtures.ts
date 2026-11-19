/**
 * Records network fixtures and live verification results from a machine with internet access (the GitHub Actions
 * runner), because the build environment cannot reach arXiv. Output goes to stdout between markers; the fixtures are
 * copied into apps/worker-node/tests/fixtures/ by hand, unchanged. Uses only Node built-ins and the real verifier.
 *   node apps/worker-node/scripts/record-fixtures.ts   (second run: re-checks the tightened captcha heuristic)
 */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { safeFetch } from "../src/safe-fetch.ts";
import { verifySource } from "../src/verify.ts";

const out = (name: string, body: Buffer, status: number, finalUrl: string) =>
  console.log(`=== FIXTURE ${name} status=${status} final=${finalUrl} bytes=${body.length}\n${gzipSync(body).toString("base64")}\n=== END ${name}`);

for (const [name, url, accept] of [
  ["arxiv-2309.06180.xml", "https://export.arxiv.org/api/query?id_list=2309.06180", "application/atom+xml"],
  ["github-repo-vllm.json", "https://api.github.com/repos/vllm-project/vllm", "application/vnd.github+json"],
] as const) {
  const r = await safeFetch(url, { accept, totalTimeoutMs: 30_000 });
  if (r.ok) out(name, r.body, r.status, r.finalUrl);
  else console.log(`=== FIXTURE-FAILED ${name}: ${r.reason} ${r.detail}`);
}

// Live verification of every seed source (content/sources.yaml), one line of JSON each.
const yaml = readFileSync(new URL("../../../content/sources.yaml", import.meta.url), "utf8");
const entries = [...yaml.matchAll(/^- id: (\S+)\n  kind: (\S+)\n  url: (\S+)\n  title: "([^"]*)"/gm)].map((m) => ({ id: m[1]!, kind: m[2]!, url: m[3]!, title: m[4]! }));
for (const e of entries) {
  const r = await verifySource({ url: e.url, kind: e.kind, expectedTitle: null }, { fetchOptions: { totalTimeoutMs: 30_000 } });
  console.log(`=== VERIFY ${JSON.stringify({ id: e.id, url: e.url, verification: r.verification, method: r.method, note: r.note, title: r.title ?? null, finalUrl: r.finalUrl ?? null, licence: r.licence ?? null, lastActivityAt: r.lastActivityAt ?? null })}`);
}
console.log(`=== DONE ${new Date().toISOString()} sources=${entries.length}`);
