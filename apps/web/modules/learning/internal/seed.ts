import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "../../../db/client.ts";
import { exercises, gateSkills, gates, skillEdges, skills, sources, weeks } from "../../../db/schema/index.ts";
import { sha256Hex } from "../../platform/service.ts";
import type { Content } from "./content-schema.ts";

/**
 * Idempotent content -> DB seed, run at boot after migrations. Curriculum rows are replaced by content.
 * Source rows are inserted once; later runs never overwrite verification fields (the verification job owns them).
 */
export async function seedContent(c: Content) {
  const db = getDb();
  const v = c.curriculum.content_version;
  await db.transaction(async (tx) => {
    for (const s of c.curriculum.skills) await tx.insert(skills).values(s).onDuplicateKeyUpdate({ set: { name: s.name, area: s.area } });
    for (const [from, to] of c.curriculum.skill_edges) await tx.insert(skillEdges).values({ fromSkill: from, toSkill: to }).onDuplicateKeyUpdate({ set: { fromSkill: from } });
    for (const w of c.curriculum.ri_weeks) {
      const row = { id: w.id, mode: "RI" as const, ordinal: w.ordinal, title: w.title, hardware: w.hardware, contentVersion: v, riWeekIds: [w.id],
        noAiCode: w.no_ai_code, publishRestricted: w.publish_restricted, restrictionNote: w.restriction_note ?? null };
      await tx.insert(weeks).values(row).onDuplicateKeyUpdate({ set: row });
      for (const g of w.gates) {
        const grow = { id: g.id, weekId: w.id, kind: g.kind, rubricJson: g.rubric ?? null, requiredEvidence: g.required_evidence, skillIds: g.skills ?? w.skills, objectiveSpec: { title: g.title, objective: g.objective }, contentVersion: v };
        await tx.insert(gates).values(grow).onDuplicateKeyUpdate({ set: grow });
        for (const s of g.skills ?? w.skills) await tx.insert(gateSkills).values({ gateId: g.id, skillId: s }).onDuplicateKeyUpdate({ set: { gateId: g.id } });
      }
    }
    for (const a of c.curriculum.acc_weeks) {
      const hw = c.curriculum.ri_weeks.filter((w) => a.ri.includes(w.id)).map((w) => w.hardware);
      const hardware = hw.includes("GPU_RENT") ? "GPU_RENT" : hw.includes("GPU_FREE") ? "GPU_FREE" : "CPU";
      const noAi = c.curriculum.ri_weeks.filter((w) => a.ri.includes(w.id)).some((w) => w.no_ai_code);
      const row = { id: a.id, mode: "ACC" as const, ordinal: a.ordinal, title: a.title, hardware: hardware as "CPU" | "GPU_FREE" | "GPU_RENT", contentVersion: v, riWeekIds: a.ri, noAiCode: noAi, publishRestricted: false, restrictionNote: null };
      await tx.insert(weeks).values(row).onDuplicateKeyUpdate({ set: row });
    }
    for (const e of c.exercises.values()) {
      const row = { id: e.id, gateId: e.gate, weekId: e.week, language: e.language, practiceRuntime: e.practice_runtime, publicTestsUri: `content:exercises/${e.id}/practice_tests.py`, gateTestsRef: e.gate_tests_ref, solutionUri: `content:exercises/${e.id}/solution.py` };
      await tx.insert(exercises).values(row).onDuplicateKeyUpdate({ set: row });
    }
    for (const s of c.sources) {
      const now = new Date();
      await tx.insert(sources).values({
        kind: s.kind, url: s.url, urlHash: sha256Hex(s.url), title: s.title, venue: s.venue ?? null, year: s.year ?? null, licence: s.licence ?? null,
        lastActivityAt: s.last_activity_at ?? null, verification: s.verification, verifiedAt: s.verified_at, lastCheckedAt: s.verified_at ?? now,
        verifyMethod: s.verify_method, verifyNote: s.note ?? null, seedVerifiedAt: s.verified_at, externalId: `content:${s.id}`,
      }).onDuplicateKeyUpdate({ set: { title: sql`title` } });
    }
  });
}
