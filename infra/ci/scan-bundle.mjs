#!/usr/bin/env node
/**
 * AT-03: fail if a secret reaches the client bundle (.next/static).
 * Two checks: (1) exact canary values that CI injected as every secret env var at build time;
 * (2) generic secret patterns. Usage: node infra/ci/scan-bundle.mjs [dir]   (CANARY_VALUES = comma-separated)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "apps/web/.next/static";
const canaries = (process.env.CANARY_VALUES ?? "").split(",").map((s) => s.trim()).filter((s) => s.length >= 12);
const patterns = [
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Anthropic API key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["GitHub token", /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/],
  ["GitHub fine-grained PAT", /github_pat_[A-Za-z0-9_]{40,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["secret env name with value", /(BETTER_AUTH_SECRET|TOKEN_ENC_KEY|INTERNAL_HMAC_KEY|GITHUB_APP_CLIENT_SECRET|GITHUB_APP_PRIVATE_KEY)["']?\s*[:=]\s*["'][^"']{8,}/],
  ["MySQL URL with password", /mysql:\/\/[^:\s"']+:[^@\s"']+@/],
  ["Redis URL with password", /redis:\/\/[^@\s"']*:[^@\s"']+@/],
];

function* files(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}

let count = 0;
const findings = [];
for (const f of files(dir)) {
  count++;
  const text = readFileSync(f, "latin1");
  for (const c of canaries) if (text.includes(c)) findings.push(`${f}: canary secret value found`);
  for (const [name, re] of patterns) if (re.test(text)) findings.push(`${f}: ${name}`);
}
if (count === 0) {
  console.error(`scan-bundle: no files under ${dir}; build first`);
  process.exit(2);
}
if (canaries.length === 0) console.warn("scan-bundle: CANARY_VALUES empty; only pattern checks ran");
if (findings.length) {
  console.error("AT-03 FAIL: secrets in client bundle:\n" + findings.join("\n"));
  process.exit(1);
}
console.log(`AT-03 PASS: scanned ${count} files in ${dir}; ${canaries.length} canaries, ${patterns.length} patterns, 0 findings`);
