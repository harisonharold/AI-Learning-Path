/**
 * Records network fixtures and live verification results from a machine with internet access (a GitHub Actions
 * runner), because the build environment cannot reach arXiv. Output goes to stdout between markers; the fixtures are
 * copied into apps/worker-node/tests/fixtures/ by hand, unchanged. Uses only Node built-ins and the real verifier.
 *   node apps/worker-node/scripts/record-fixtures.ts
 * It ran in a temporary workflow (runs 44438734135, 44439429301, 44442473884, 44442659584) that was then removed.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

// Q27: course repositories atlas-lab may run graders from (the learner's own clone, pinned). Read-only lookups of
// branch commits and the LICENSE header; nothing is copied into this repository.
for (const repo of ["git://g.csail.mit.edu/xv6-labs-2026"]) {
  try {
    const refs = execFileSync("git", ["ls-remote", repo], { encoding: "utf8", timeout: 60_000 });
    console.log(`=== COURSE-REFS ${repo}\n${refs.trim()}\n=== END COURSE-REFS`);
    const dir = mkdtempSync(join(tmpdir(), "course-"));
    execFileSync("git", ["clone", "-q", "--depth", "1", "--branch", "util", repo, dir], { timeout: 120_000 });
    const lic = execFileSync("sh", ["-c", `ls ${dir}; head -12 ${dir}/LICENSE 2>/dev/null || echo NO-LICENSE-FILE`], { encoding: "utf8" });
    console.log(`=== COURSE-LICENSE ${repo}\n${lic.trim()}\n=== END COURSE-LICENSE`);
  } catch (e) {
    console.log(`=== COURSE-FAILED ${repo}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
}
