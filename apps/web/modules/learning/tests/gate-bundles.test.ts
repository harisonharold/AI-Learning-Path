/** atlas-lab gate bundles: loaded, pinned by digest, hashed deterministically, validated against their test files. */
import { describe, expect, it } from "vitest";
import { validateContent } from "../internal/content-schema.ts";
import { bundleSha } from "../internal/content.ts";
import { content } from "./helpers.ts";

describe("gate test bundles", () => {
  const b = content.gateBundles.get("atlas-lab:w01@1")!;
  it("the W1 bundle exists, is pinned by digest and matches its exercise", () => {
    expect(b).toBeTruthy();
    expect(b.image).toMatch(/@sha256:[0-9a-f]{64}$/);
    expect(content.exercises.get(b.exercise)!.gate_tests_ref).toBe(b.ref);
  });
  it("the hash covers the manifest and every file", () => {
    const { fileContents, sha256: _s, ...manifest } = b;
    expect(bundleSha(manifest, fileContents)).toBe(b.sha256);
    expect(bundleSha(manifest, { ...fileContents, "test_hidden.py": `${fileContents["test_hidden.py"]}\n` })).not.toBe(b.sha256);
    expect(bundleSha({ ...manifest, timeout_seconds: 61 }, fileContents)).not.toBe(b.sha256);
  });
  it("validation catches a test list that doesn't match the test functions, or a missing canary", () => {
    const tampered = new Map(content.gateBundles);
    tampered.set(b.ref, { ...b, tests: b.tests.slice(1) });
    expect(validateContent({ ...content, gateBundles: tampered }).join()).toMatch(/tests list does not match/);
    tampered.set(b.ref, { ...b, canary: "missing-canary-xyz" });
    expect(validateContent({ ...content, gateBundles: tampered }).join()).toMatch(/canary missing/);
  });
});

describe("Q27 course graders", () => {
  it("records a licence and full pinned commits for each course, and every entry maps to its week's gate", () => {
    expect(content.courseGraders.map((c) => c.gate_ref).sort()).toEqual(["atlas-lab:w04@1", "atlas-lab:w07@1", "atlas-lab:w08@1"]);
    for (const c of content.courseGraders) {
      expect(c.licence.length).toBeGreaterThan(3);
      for (const sha of Object.values(c.pins)) expect(sha).toMatch(/^[0-9a-f]{40}$/);
    }
    expect(validateContent(content)).toEqual([]);
  });
  it("a licence that forbids running the grader forces the gate to be manual/self-assessed", () => {
    const forbidden = content.courseGraders.map((c) => (c.gate_ref === "atlas-lab:w08@1" ? { ...c, use_allowed: false } : c));
    expect(validateContent({ ...content, courseGraders: forbidden }).join()).toMatch(/w08@1: licence does not allow.*g-w08 must be manual\/self-assessed/);
  });
});
