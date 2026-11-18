import "server-only";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db/client.ts";
import { projectReports, projects, runConfigs, runGpuTimeline, runMetrics, runSamples, runs } from "../../../db/schema/index.ts";
import type { BenchmarkUpload } from "./contract.ts";
import type { Prereg, RunFacts } from "./rules.ts";
import type { CoreSummary } from "./summary.ts";

export const SAMPLE_CAP = 100_000;
export const GPU_CAP = 50_000;
const INSERT_BATCH = 5_000;

const insertId = (res: unknown) => Number((res as [{ insertId: number | bigint }])[0].insertId);

export type ProjectRow = typeof projects.$inferSelect;

export async function createProject(userId: string, p: { title: string; hypothesis?: string | null; planMd?: string | null }, isMock = false) {
  return insertId(await getDb().insert(projects).values({ userId, title: p.title, hypothesis: p.hypothesis ?? null, planMd: p.planMd ?? null, isMock }));
}

export async function listProjects(userId: string, includeMock: boolean) {
  const where = includeMock ? eq(projects.userId, userId) : and(eq(projects.userId, userId), eq(projects.isMock, false));
  return getDb().select().from(projects).where(where).orderBy(desc(projects.updatedAt));
}

export async function projectById(id: number) {
  return (await getDb().select().from(projects).where(eq(projects.id, id)).limit(1))[0];
}

export async function updateProject(id: number, set: Partial<Pick<ProjectRow, "title" | "hypothesis" | "planMd" | "status" | "preregJson" | "preregisteredAt" | "minRepetitions">>) {
  if (Object.keys(set).length) await getDb().update(projects).set(set).where(eq(projects.id, id));
}

export async function upsertConfig(projectId: number, name: string, config: Record<string, unknown>, hash: string) {
  const db = getDb();
  const found = (await db.select().from(runConfigs).where(and(eq(runConfigs.projectId, projectId), eq(runConfigs.configHash, hash))).limit(1))[0];
  if (found) return found.id;
  return insertId(await db.insert(runConfigs).values({ projectId, name, configJson: config, configHash: hash }));
}

export async function runByUploadSha(projectId: number, sha: string) {
  return (await getDb().select({ id: runs.id }).from(runs).where(and(eq(runs.projectId, projectId), eq(runs.uploadSha256, sha))).limit(1))[0]?.id;
}

export interface NewRun {
  projectId: number; configId: number; upload: BenchmarkUpload; envFingerprint: string; source: "runner" | "upload" | "notebook";
  runnerTokenId: number | null; uploadSha256: string; isMock: boolean; summaries: Map<string, CoreSummary>;
  gpu: { t_ms: number; util_pct: number; mem_mb: number; power_w?: number | undefined }[]; userId: string; rawDir: string;
}

/** Writes a run, its metrics (server summaries), capped samples, overflow files and GPU timeline. */
export async function insertRun(r: NewRun) {
  const u = r.upload;
  const db = getDb();
  const runId = await db.transaction(async (tx) => {
    const id = insertId(await tx.insert(runs).values({
      projectId: r.projectId, configId: r.configId, isBaseline: u.is_baseline, envJson: u.env, envFingerprint: r.envFingerprint, status: u.status,
      failureNote: u.failure_note ?? null, isWarmup: u.is_warmup, source: r.source, runnerTokenId: r.runnerTokenId, uploadSha256: r.uploadSha256,
      command: u.command ?? null, startedAt: new Date(u.started_at), endedAt: new Date(u.ended_at), isMock: r.isMock,
    }));
    for (const m of u.metrics) {
      const s = r.summaries.get(m.name)!;
      await tx.insert(runMetrics).values({ runId: id, metric: m.name, unit: m.unit, summaryJson: { ...s, ci_status: "pending" }, clientSummaryJson: m.summary ?? null, n: m.samples.length });
      const kept = m.samples.slice(0, SAMPLE_CAP);
      for (let i = 0; i < kept.length; i += INSERT_BATCH) {
        await tx.insert(runSamples).values(kept.slice(i, i + INSERT_BATCH).map((value, j) => ({ runId: id, metric: m.name, seq: i + j, value })));
      }
    }
    for (let i = 0; i < r.gpu.length; i += INSERT_BATCH) {
      await tx.insert(runGpuTimeline).values(r.gpu.slice(i, i + INSERT_BATCH).map((p, j) => ({ runId: id, seq: i + j, tMs: p.t_ms, utilPct: p.util_pct, memMb: p.mem_mb, powerW: p.power_w ?? null })));
    }
    return id;
  });
  // Overflow beyond the DB cap: the full sample set goes to a gzip JSON file; the summary above was computed from all samples.
  for (const m of u.metrics.filter((x) => x.samples.length > SAMPLE_CAP)) {
    const dir = join(r.rawDir, r.userId, String(runId));
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${m.name}.json.gz`);
    await writeFile(file, gzipSync(JSON.stringify(m.samples)));
    await db.update(runMetrics).set({ rawUri: `raw://${r.userId}/${runId}/${m.name}.json.gz` }).where(and(eq(runMetrics.runId, runId), eq(runMetrics.metric, m.name)));
  }
  return runId;
}

export async function runsOfProject(projectId: number) {
  return getDb().select({ run: runs, configName: runConfigs.name, config: runConfigs.configJson }).from(runs)
    .innerJoin(runConfigs, eq(runConfigs.id, runs.configId)).where(eq(runs.projectId, projectId)).orderBy(asc(runs.id));
}

export async function metricsOfRuns(runIds: number[]) {
  if (!runIds.length) return [];
  return getDb().select().from(runMetrics).where(inArray(runMetrics.runId, runIds));
}

export async function runFacts(projectId: number): Promise<RunFacts[]> {
  const rs = await runsOfProject(projectId);
  const ms = await metricsOfRuns(rs.map((r) => r.run.id));
  return rs.map(({ run, configName }) => ({
    id: run.id, configId: run.configId, configName, status: run.status, isBaseline: run.isBaseline, isWarmup: run.isWarmup, isMock: run.isMock,
    envFingerprint: run.envFingerprint, metrics: ms.filter((m) => m.runId === run.id).map((m) => m.metric),
  }));
}

export async function runWithProject(runId: number) {
  return (await getDb().select({ run: runs, project: projects, configName: runConfigs.name, config: runConfigs.configJson }).from(runs)
    .innerJoin(projects, eq(projects.id, runs.projectId)).innerJoin(runConfigs, eq(runConfigs.id, runs.configId)).where(eq(runs.id, runId)).limit(1))[0];
}

export async function samplesOf(runId: number, metric: string) {
  const rows = await getDb().select({ value: runSamples.value }).from(runSamples).where(and(eq(runSamples.runId, runId), eq(runSamples.metric, metric))).orderBy(asc(runSamples.seq));
  return rows.map((r) => r.value);
}

export async function gpuOf(runId: number) {
  return getDb().select().from(runGpuTimeline).where(eq(runGpuTimeline.runId, runId)).orderBy(asc(runGpuTimeline.seq));
}

/** Merges the stats job's CIs, histogram and CDF into the stored summary. The core numbers stay the upload-time ones. */
export async function applyStats(runId: number, metrics: Record<string, Record<string, unknown>>) {
  const db = getDb();
  for (const m of await db.select().from(runMetrics).where(eq(runMetrics.runId, runId))) {
    const s = metrics[m.metric];
    if (!s) continue;
    const { ci95, method, resamples, seed, basis_n, histogram, cdf } = s;
    await db.update(runMetrics).set({ summaryJson: { ...(m.summaryJson as object), ci95, ci_method: method, resamples, seed, basis_n, histogram, cdf, ci_status: "done" } })
      .where(and(eq(runMetrics.runId, runId), eq(runMetrics.metric, m.metric)));
  }
}

export async function markStatsFailed(runId: number) {
  const db = getDb();
  for (const m of await db.select().from(runMetrics).where(eq(runMetrics.runId, runId))) {
    await db.update(runMetrics).set({ summaryJson: { ...(m.summaryJson as object), ci_status: "failed" } }).where(and(eq(runMetrics.runId, runId), eq(runMetrics.metric, m.metric)));
  }
}

export async function createReport(projectId: number, userId: string, jobId: string, runIds: number[]) {
  return insertId(await getDb().insert(projectReports).values({ projectId, userId, jobId, runIds }));
}

export async function finishReport(jobId: string, r: { markdown: string; html: string } | { error: string }) {
  await getDb().update(projectReports).set("error" in r ? { status: "failed", error: r.error, finishedAt: new Date() } : { status: "done", markdown: r.markdown, html: r.html, finishedAt: new Date() })
    .where(eq(projectReports.jobId, jobId));
}

export async function reportsOf(projectId: number) {
  return getDb().select({ id: projectReports.id, status: projectReports.status, createdAt: projectReports.createdAt, finishedAt: projectReports.finishedAt, error: projectReports.error, runIds: projectReports.runIds })
    .from(projectReports).where(eq(projectReports.projectId, projectId)).orderBy(desc(projectReports.createdAt));
}

export async function reportById(id: number) {
  return (await getDb().select().from(projectReports).where(eq(projectReports.id, id)).limit(1))[0];
}

export async function preregOf(p: ProjectRow): Promise<Prereg | null> {
  return p.preregisteredAt && p.preregJson ? (p.preregJson as Prereg) : null;
}

/** Sample data is a separate project flagged is_mock; turning sample data off deletes it (rows cascade). */
export async function deleteSampleProjects(userId: string) {
  await getDb().delete(projects).where(and(eq(projects.userId, userId), eq(projects.isMock, true)));
}

export async function removeRawData(rawDir: string, userId: string) {
  await rm(join(rawDir, userId), { recursive: true, force: true });
}
