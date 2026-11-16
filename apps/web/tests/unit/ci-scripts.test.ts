/** The CI guards must actually fail when a violation is planted (AT-03, AT-42). */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const run = (script: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync("node", [join(root, script), ...args], { cwd: root, env: { ...process.env, ...env }, encoding: "utf8" });

describe("AT-03 bundle scanner", () => {
  const dir = () => { const d = mkdtempSync(join(tmpdir(), "bundle-")); mkdirSync(join(d, "chunks")); return d; };
  it("passes a clean bundle", () => {
    const d = dir();
    writeFileSync(join(d, "chunks/a.js"), "console.log('hello')");
    expect(run("infra/ci/scan-bundle.mjs", [d], { CANARY_VALUES: "canary-abcdef123456" }).status).toBe(0);
  });
  it("fails on a planted canary value", () => {
    const d = dir();
    writeFileSync(join(d, "chunks/a.js"), "const x='canary-hmac-0011223344556677';");
    const r = run("infra/ci/scan-bundle.mjs", [d], { CANARY_VALUES: "canary-hmac-0011223344556677" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("canary secret value found");
  });
  it.each([
    ["-----BEGIN RSA PRIVATE KEY-----", "private key block"],
    ["sk-ant-api03-" + "x".repeat(30), "Anthropic API key"],
    ["ghu_" + "a".repeat(36), "GitHub token"],
    ["mysql://atlas_app:pw@mysql:3306/atlas", "MySQL URL with password"],
  ])("fails on pattern %s", (planted, name) => {
    const d = dir();
    writeFileSync(join(d, "chunks/a.js"), `var s="${planted}";`);
    const r = run("infra/ci/scan-bundle.mjs", [d]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(name);
  });
});

describe("AT-42 forbidden strings", () => {
  it.each([
    ["Your recruiter score is 87", "recruiter score"],
    ["You have an 80% probability of getting hired", "probability"],
    ["We guarantee a job", "guarantee"],
    ["This is a novel idea", "novel"],
  ])("fails on %j", (text, name) => {
    const d = mkdtempSync(join(tmpdir(), "src-"));
    writeFileSync(join(d, "page.tsx"), `export const t = ${JSON.stringify(text)};\n`);
    const r = run("infra/ci/forbidden-strings.mjs", [], { FORBIDDEN_ROOTS: d });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(name);
  });
  it("passes honest copy", () => {
    const d = mkdtempSync(join(tmpdir(), "src-"));
    writeFileSync(join(d, "page.tsx"), 'export const t = "This is a checklist of evidence, not a prediction of interviews or offers. No prior work found in these searches.";\n');
    expect(run("infra/ci/forbidden-strings.mjs", [], { FORBIDDEN_ROOTS: d }).status).toBe(0);
  });
});
