import { describe, expect, it } from "vitest";
import { computeRoadmap, type RoadmapInput } from "../internal/roadmap.ts";
import { content, statuses } from "./helpers.ts";

const run = (passed: string[], opts: Partial<RoadmapInput> = {}) =>
  computeRoadmap({ curriculum: content.curriculum, mode: "RI", gateStatus: statuses(passed), openRemediationGates: new Set(), ...opts });
const state = (r: ReturnType<typeof run>, id: string) => r.weeks.find((w) => w.id === id)!.state;

describe("AT-06: hours logged never unlock a gated node", () => {
  it("W3 (needs C and memory) is locked while the W2 gate is not passed, whatever else is passed", () => {
    expect(state(run(["g-w01"]), "RI-W03")).toBe("locked");
  });
  it("the lock function has no time input at all (compile-time + runtime)", () => {
    const input = { curriculum: content.curriculum, mode: "RI" as const, gateStatus: statuses(["g-w01"]), openRemediationGates: new Set<string>() };
    // @ts-expect-error minutesLogged is not part of RoadmapInput: time cannot influence locks.
    const withHours: RoadmapInput = { ...input, minutesLogged: 100 * 60 };
    expect(computeRoadmap(withHours)).toEqual(computeRoadmap(input));
  });
  it("passing W2's gate is what unlocks W3", () => expect(state(run(["g-w01", "g-w02"]), "RI-W03")).toBe("available"));
});

describe("AT-11: a failed gate creates remediation and locks only dependants", () => {
  const r = run(["g-w01"], { gateStatus: statuses(["g-w01"], { "g-w02": "failed" }), openRemediationGates: new Set(["g-w02"]) });
  it("the failed week shows remediation", () => expect(state(r, "RI-W02")).toBe("remediation"));
  it("dependants of C and memory stay locked", () => {
    for (const w of ["RI-W03", "RI-W04", "RI-W05"]) expect(state(r, w), w).toBe("locked");
  });
  it("independent tracks keep going (Go, numerics)", () => {
    expect(state(r, "RI-W07")).toBe("available");
    expect(state(r, "RI-W13")).toBe("available");
  });
});

describe("advanced weeks need the W12 and W15 exams (G §6.1)", () => {
  const upTo17 = content.curriculum.ri_weeks.filter((w) => w.ordinal <= 17).flatMap((w) => w.gates.map((g) => g.id));
  it("W18 stays locked even with every earlier gate except the exams", () => {
    const r = run(upTo17.filter((g) => g !== "g-w12-exam" && g !== "g-w15-exam"));
    expect(state(r, "RI-W18")).toBe("locked");
    expect(r.weeks.find((w) => w.id === "RI-W18")!.lockedBy).toEqual(expect.arrayContaining(["gate: g-w12-exam", "gate: g-w15-exam"]));
  });
  it("W18 opens once all prerequisites and both exams pass", () => expect(state(run(upTo17), "RI-W18")).toBe("available"));
});

describe("roadmap basics", () => {
  it("day 1: only W1 is available, and it is the current week", () => {
    const r = run([]);
    expect(r.weeks.filter((w) => w.state !== "locked").map((w) => w.id)).toEqual(["RI-W01"]);
    expect(r.currentWeekId).toBe("RI-W01");
    expect(r.currentRiOrdinal).toBe(1);
  });
  it("ACC mode merges weeks; ACC-02 (W2+W3) opens when W2 opens", () => {
    const r = computeRoadmap({ curriculum: content.curriculum, mode: "ACC", gateStatus: statuses(["g-w01"]), openRemediationGates: new Set() });
    expect(r.weeks).toHaveLength(16);
    expect(r.weeks.find((w) => w.id === "ACC-02")!.state).toBe("available");
    expect(r.weeks.find((w) => w.id === "ACC-02")!.gateIds).toEqual(["g-w02", "g-w03"]);
  });
});
