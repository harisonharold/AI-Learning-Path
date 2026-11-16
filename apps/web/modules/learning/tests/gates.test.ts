import { describe, expect, it } from "vitest";
import { evaluateGate } from "../internal/gates.ts";
import { ev, gate, score } from "./helpers.ts";

const w01 = gate("g-w01");
const w02 = gate("g-w02");
const runner = (ref: string, passed: boolean, verified = true, min = 0) => ev({ kind: "runner_result", ref, passed, verified, createdAt: new Date(Date.UTC(2026, 10, 16, 12, min)) });
const quiz = (passed: boolean) => ev({ kind: "server_graded", quiz: "q-w01", passed, verified: true });

describe("AT-07: a gate stays 'pending evidence' until all required evidence exists", () => {
  it("tests-only submission for a gate that also needs a report is pending_evidence", () => {
    const r = evaluateGate(w02, [runner("atlas-lab:w02@1", true)], []);
    expect(r.status).toBe("pending_evidence");
    expect(r.missing.join()).toMatch(/write-up/);
  });
  it("tests + report but no rubric scores is still pending", () => {
    expect(evaluateGate(w02, [runner("atlas-lab:w02@1", true), ev({ kind: "report", url: "https://github.com/x/y/blob/abc/REPORT.md" })], []).status).toBe("pending_evidence");
  });
  it("all evidence + passing rubric -> passed", () => {
    const s = ["Bug identified precisely", "Root cause in terms of memory layout", "Fix and how it was verified"].map((c) => score(c, "competent"));
    const r = evaluateGate(w02, [runner("atlas-lab:w02@1", true), ev({ kind: "report", url: "https://x" })], s);
    expect(r.status).toBe("passed");
    expect(r.rubric.selfAssessed).toBe(true);
  });
  it("W1 needs both the runner result and the quiz", () => {
    expect(evaluateGate(w01, [quiz(true)], []).status).toBe("pending_evidence");
    expect(evaluateGate(w01, [quiz(true), runner("atlas-lab:w01@1", true)], []).status).toBe("passed");
  });
});

describe("X-13: only verified counting evidence satisfies a requirement", () => {
  it("an unverified runner result does not count", () => expect(evaluateGate(w01, [quiz(true), runner("atlas-lab:w01@1", true, false)], []).status).toBe("pending_evidence"));
  it("a runner result for a different ref does not count", () => expect(evaluateGate(w01, [quiz(true), runner("atlas-lab:w99@1", true)], []).status).toBe("pending_evidence"));
  it("a failed objective result fails the gate", () => expect(evaluateGate(w01, [quiz(true), runner("atlas-lab:w01@1", false)], []).status).toBe("failed"));
  it("the latest result wins (re-attempt after a failure)", () =>
    expect(evaluateGate(w01, [quiz(true), runner("atlas-lab:w01@1", false, true, 0), runner("atlas-lab:w01@1", true, true, 5)], []).status).toBe("passed"));
  it("a self rubric cannot stand in for an objective requirement", () =>
    expect(evaluateGate(w01, [quiz(true), ev({ kind: "self_rubric", passed: true, verified: true })], []).status).toBe("pending_evidence"));
});

describe("X-11: rubric scorer rules (Q6)", () => {
  const crit = ["Bug identified precisely", "Root cause in terms of memory layout", "Fix and how it was verified"];
  const base = [runner("atlas-lab:w02@1", true), ev({ kind: "report", url: "https://x" })];
  it("ai_suggested scores never count", () => {
    const r = evaluateGate(w02, base, crit.map((c) => score(c, "strong", "ai_suggested")));
    expect(r.status).toBe("pending_evidence");
    expect(r.rubric.complete).toBe(false);
  });
  it("any 'missing' criterion fails", () => expect(evaluateGate(w02, base, [score(crit[0]!, "strong"), score(crit[1]!, "strong"), score(crit[2]!, "missing")]).status).toBe("failed"));
  it("fewer than half competent-or-better fails", () => expect(evaluateGate(w02, base, [score(crit[0]!, "competent"), score(crit[1]!, "partial"), score(crit[2]!, "partial")]).status).toBe("failed"));
  it("reviewer scores are not labelled self-assessed", () => {
    const r = evaluateGate(w02, base, crit.map((c) => score(c, "competent", "reviewer")));
    expect(r.status).toBe("passed");
    expect(r.rubric.selfAssessed).toBe(false);
  });
  it("a later score replaces an earlier one", () =>
    expect(evaluateGate(w02, base, [...crit.map((c) => score(c, "competent")), score(crit[0]!, "missing", "self", 9)]).status).toBe("failed"));
});
