import "server-only";
import { audit, enqueueJob, getEnv, sha256Hex } from "@/modules/platform/service";
import * as paperRepo from "./internal/papers.ts";
import * as sourceRepo from "./internal/sources.ts";
import { callApiPy } from "./internal/apipy.ts";
import { type BenchmarkUpload, configHash, envFingerprint } from "./internal/contract.ts";
import * as repo from "./internal/repo.ts";
import { CONFOUNDER_CHECKLIST, confounderWarnings, counts, diff, type EnvLike, type Prereg, preregChangeError, reportReadiness, ResearchError } from "./internal/rules.ts";
import { seedSampleProject } from "./internal/sample.ts";
import { type CoreSummary, describe, downsampleMax, strideSample } from "./internal/summary.ts";

export { freshness, STALE_AFTER_DAYS, type Freshness } from "./internal/freshness.ts";
export { BenchmarkUpload, GateResultUpload, RunnerUpload, MAX_UPLOAD_BYTES, canonicalJson, configHash, sha256 } from "./internal/contract.ts";
export { ResearchError, CONFOUNDER_CHECKLIST, type Prereg } from "./internal/rules.ts";

const STATS_JOB_MAX = 100_000;
const REPORT_POOL_MAX = 200_000;

async function ownedProject(userId: string, id: number) {
  const p = await repo.projectById(id);
  if (!p) throw new ResearchError("NOT_FOUND", "Project not found.");
  if (p.userId !== userId) throw new ResearchError("FORBIDDEN", "Not your project.");
  return p;
}

export async function listProjects(userId: string, includeSample: boolean) {
  return (await repo.listProjects(userId, includeSample)).map((p) => ({ id: p.id, title: p.title, status: p.status, preregistered: !!p.preregisteredAt, isMock: p.isMock, updatedAt: p.updatedAt }));
}

export async function createProject(userId: string, input: { title: string; hypothesis?: string | undefined; planMd?: string | undefined }) {
  return { id: await repo.createProject(userId, input) };
}

export interface ProjectPatch {
  title?: string | undefined; hypothesis?: string | undefined; planMd?: string | undefined; amendment?: string | undefined;
  prereg?: Prereg | undefined; status?: "draft" | "running" | "concluded" | "abandoned" | undefined;
}

/** Pre-registration is immutable once saved (F.5); later changes are timestamped amendments appended to the plan. */
export async function patchProject(userId: string, id: number, patch: ProjectPatch, now = new Date()) {
  const p = await ownedProject(userId, id);
  const err = preregChangeError(p, patch);
  if (err) throw new ResearchError("CONFLICT", err);
  const set: Parameters<typeof repo.updateProject>[1] = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.hypothesis !== undefined) set.hypothesis = patch.hypothesis;
  if (patch.planMd !== undefined) set.planMd = patch.planMd;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.prereg) {
    if (!(patch.hypothesis ?? p.hypothesis)?.trim()) throw new ResearchError("INVALID", "Write the hypothesis before pre-registering.");
    set.preregJson = patch.prereg;
    set.preregisteredAt = now;
    set.minRepetitions = patch.prereg.min_repetitions;
  }
  if (patch.amendment) {
    if (!p.preregisteredAt) throw new ResearchError("INVALID", "Amendments are for changes after pre-registration; edit the plan directly before that.");
    set.planMd = `${p.planMd ?? ""}\n\n### Amendment ${now.toISOString()}\n\n${patch.amendment}`.trimStart();
  }
  await repo.updateProject(id, set);
  return project(userId, id);
}

const amendmentsOf = (planMd: string | null) =>
  [...(planMd ?? "").matchAll(/### Amendment (\S+)\n\n([\s\S]*?)(?=\n\n### Amendment |$)/g)].map((m) => `${m[1]}: ${m[2]!.trim()}`);

export async function project(userId: string, id: number) {
  const p = await ownedProject(userId, id);
  const rows = await repo.runsOfProject(id);
  const metrics = await repo.metricsOfRuns(rows.map((r) => r.run.id));
  const prereg = await repo.preregOf(p);
  const facts = await repo.runFacts(id);
  const readiness = reportReadiness(prereg, p.isMock, facts);
  const configs = new Map<number, { id: number; name: string; config: unknown }>();
  for (const r of rows) configs.set(r.run.configId, { id: r.run.configId, name: r.configName, config: r.config });
  return {
    id: p.id, title: p.title, hypothesis: p.hypothesis, planMd: p.planMd, status: p.status, isMock: p.isMock, prereg, preregisteredAt: p.preregisteredAt,
    amendments: amendmentsOf(p.planMd), configs: [...configs.values()],
    runs: rows.map(({ run, configName }) => ({
      id: run.id, configId: run.configId, configName, status: run.status, failureNote: run.failureNote, isBaseline: run.isBaseline, isWarmup: run.isWarmup,
      isMock: run.isMock, source: run.source, envFingerprint: run.envFingerprint, startedAt: run.startedAt, command: run.command,
      metrics: metrics.filter((m) => m.runId === run.id).map((m) => ({ metric: m.metric, unit: m.unit, n: m.n, summary: m.summaryJson as Record<string, unknown>, rawUri: m.rawUri })),
    })),
    readiness, reports: await repo.reportsOf(id), checklist: CONFOUNDER_CHECKLIST,
  };
}

/**
 * Stores an uploaded run (session upload or atlas-lab). The server recomputes every summary from the raw samples and
 * keeps the client's summary only for audit (AT-15). Re-sending the same bytes returns the existing run (idempotent).
 */
export async function ingestRun(userId: string, upload: BenchmarkUpload, meta: { source: "runner" | "upload"; runnerTokenId: number | null; uploadSha256: string }) {
  const p = await ownedProject(userId, upload.project_id);
  if (p.isMock) throw new ResearchError("CONFLICT", "Sample-data projects don't take uploads.");
  if (!p.preregisteredAt) throw new ResearchError("CONFLICT", "Pre-register this project (hypothesis, primary metric, baseline, stopping rule) before uploading runs (F.5).");
  if (p.status === "concluded" || p.status === "abandoned") throw new ResearchError("CONFLICT", `This project is ${p.status}; it takes no more runs.`);
  if (configHash(upload.config) !== upload.config_hash) {
    throw new ResearchError("INVALID", "Request failed validation.", { fields: [{ path: "config_hash", message: "does not match the SHA-256 of the canonical JSON of config" }] });
  }
  const existing = await repo.runByUploadSha(p.id, meta.uploadSha256);
  if (existing) return { runId: existing, duplicate: true, summaries: {} };
  const summaries = new Map<string, CoreSummary>(upload.metrics.map((m) => [m.name, describe(m.samples)]));
  const configId = await repo.upsertConfig(p.id, upload.config_name, upload.config, upload.config_hash);
  const runId = await repo.insertRun({
    projectId: p.id, configId, upload, envFingerprint: envFingerprint(upload.env), source: meta.source, runnerTokenId: meta.runnerTokenId, uploadSha256: meta.uploadSha256,
    isMock: false, summaries, gpu: downsampleMax(upload.gpu_timeline ?? [], repo.GPU_CAP), userId, rawDir: getEnv().RAW_DATA_DIR,
  });
  if (p.status === "draft") await repo.updateProject(p.id, { status: "running" });
  if (upload.metrics.length) {
    await enqueueJob(userId, "stats.summarize",
      { run_id: runId, metrics: upload.metrics.map((m) => ({ name: m.name, values: strideSample(m.samples, STATS_JOB_MAX) })) },
      { run_id: runId, metrics: upload.metrics.map((m) => ({ name: m.name, n: m.samples.length })) });
  }
  return { runId, duplicate: false, summaries: Object.fromEntries(summaries) };
}

/** Called by the job callback for research job kinds. */
export async function applyJobResult(job: { id: string; kind: string; status: string; resultJson: unknown; payloadJson: unknown; error: string | null }) {
  if (job.kind === "stats.summarize") {
    const runId = Number((job.payloadJson as { run_id?: number }).run_id);
    if (job.status === "done") await repo.applyStats(runId, (job.resultJson as { metrics: Record<string, Record<string, unknown>> }).metrics);
    else await repo.markStatsFailed(runId);
  } else if (job.kind === "verify.source") {
    if (job.status === "done" && job.resultJson) await sourceRepo.applyVerification(job.resultJson as sourceRepo.VerifyOutcome);
  } else if (job.kind === "report.render") {
    const r = job.resultJson as { markdown?: string; html?: string } | null;
    await repo.finishReport(job.id, job.status === "done" && r?.markdown && r.html ? { markdown: r.markdown, html: r.html } : { error: job.error ?? "Report rendering failed." });
  }
}

export async function run(userId: string, runId: number) {
  const r = await repo.runWithProject(runId);
  if (!r) throw new ResearchError("NOT_FOUND", "Run not found.");
  if (r.project.userId !== userId) throw new ResearchError("FORBIDDEN", "Not your run.");
  return r;
}

/** Raw data download (F.6): the run with its samples (DB-stored part) and GPU timeline. */
export async function runExport(userId: string, runId: number) {
  const { run: rr, configName, config } = await run(userId, runId);
  const metrics = await repo.metricsOfRuns([runId]);
  return {
    run: { id: rr.id, project_id: rr.projectId, config_name: configName, config, env: rr.envJson, status: rr.status, failure_note: rr.failureNote, is_baseline: rr.isBaseline,
      is_warmup: rr.isWarmup, is_sample_data: rr.isMock, source: rr.source, started_at: rr.startedAt, ended_at: rr.endedAt, command: rr.command },
    metrics: await Promise.all(metrics.map(async (m) => ({ name: m.metric, unit: m.unit, n: m.n, server_summary: m.summaryJson, client_summary_for_audit: m.clientSummaryJson,
      samples: await repo.samplesOf(runId, m.metric), samples_truncated_at: m.n && m.n > repo.SAMPLE_CAP ? repo.SAMPLE_CAP : null, raw_uri: m.rawUri }))),
    gpu_timeline: (await repo.gpuOf(runId)).map((g) => ({ t_ms: g.tMs, util_pct: g.utilPct, mem_mb: g.memMb, power_w: g.powerW })),
  };
}

type CompareResult = { diff: Record<string, { a: number; b: number; diff: number; ci95: [number, number]; rel_pct?: number; rel_ci95?: [number, number]; ci_excludes_zero: boolean }>; mann_whitney: Record<string, number | string> };

/** Compares runs against the first one. Uses api-py for bootstrap CIs; if api-py is unavailable, returns stored
 * summaries only with `degraded: true` (NFR-5, AT-47). */
export async function compareRuns(userId: string, ids: number[], metric: string) {
  if (ids.length < 2 || ids.length > 6) throw new ResearchError("INVALID", "Compare 2 to 6 runs.");
  const rs = await Promise.all(ids.map((id) => run(userId, id)));
  const ms = await repo.metricsOfRuns(ids);
  const summaryOf = (id: number) => ms.find((m) => m.runId === id && m.metric === metric);
  for (const r of rs) if (!summaryOf(r.run.id)) throw new ResearchError("INVALID", `Run ${r.run.id} has no metric ${metric}.`);
  const [base, ...rest] = rs;
  const baseSamples = await repo.samplesOf(base!.run.id, metric);
  let degraded = false;
  const comparisons = [];
  for (const c of rest) {
    const stats = degraded ? null : await callApiPy<CompareResult>("/stats/compare", { a: baseSamples, b: await repo.samplesOf(c.run.id, metric) });
    if (!stats) degraded = true;
    const sameEnv = base!.run.envFingerprint === c.run.envFingerprint;
    comparisons.push({
      runId: c.run.id, sameEnv, stats,
      configDiff: diff(base!.config, c.config), envDiff: diff({ ...(base!.run.envJson as object), git_sha: null }, { ...(c.run.envJson as object), git_sha: null }),
      warnings: confounderWarnings({ config: base!.config, env: base!.run.envJson as EnvLike }, { config: c.config, env: c.run.envJson as EnvLike }),
    });
  }
  // RR12: compare reads at most the first 100,000 stored samples of a run; say so wherever it applies.
  const capped = rs.map((r) => ({ runId: r.run.id, n: summaryOf(r.run.id)!.n ?? 0 })).filter((r) => r.n > repo.SAMPLE_CAP);
  return {
    metric, degraded, baseRunId: base!.run.id, sampleCap: repo.SAMPLE_CAP, cappedRuns: capped,
    runs: rs.map((r) => ({ id: r.run.id, configName: r.configName, isMock: r.run.isMock, summary: summaryOf(r.run.id)!.summaryJson, unit: summaryOf(r.run.id)!.unit })),
    comparisons: degraded ? comparisons.map((c) => ({ ...c, stats: null })) : comparisons,
  };
}

/** AT-19: refuses (409 + reasons) until the baseline rule holds; otherwise enqueues rendering. */
export async function requestReport(userId: string, projectId: number, now = new Date()) {
  const p = await ownedProject(userId, projectId);
  const prereg = await repo.preregOf(p);
  const facts = await repo.runFacts(projectId);
  const ready = reportReadiness(prereg, p.isMock, facts);
  if (!ready.ready || !prereg) throw new ResearchError("CONFLICT", "A report can't be generated yet.", { reasons: ready.reasons });
  const rows = (await repo.runsOfProject(projectId)).filter((r) => !r.run.isMock);
  const ms = await repo.metricsOfRuns(rows.map((r) => r.run.id));
  const included = new Set([ready.baselineConfigId!, ...ready.candidateConfigIds]);
  const configs = [];
  for (const cid of included) {
    const cr = rows.filter((r) => r.run.configId === cid && counts({ ...r.run, configName: r.configName, metrics: [] }) && ms.some((m) => m.runId === r.run.id && m.metric === prereg.primary_metric));
    const pooled = (await Promise.all(cr.map((r) => repo.samplesOf(r.run.id, prereg.primary_metric)))).flat();
    configs.push({ id: cid, name: cr[0]!.configName, config: cr[0]!.config, env: cr[0]!.run.envJson as EnvLike, is_baseline: cid === ready.baselineConfigId,
      env_fingerprints: [...new Set(cr.map((r) => r.run.envFingerprint))], runs: cr.length, samples: strideSample(pooled, REPORT_POOL_MAX) });
  }
  const base = configs.find((c) => c.is_baseline)!;
  const diffs = configs.filter((c) => !c.is_baseline).flatMap((c) => [
    ...diff(base.config, c.config).map((d) => ({ pair: `${base.name} vs ${c.name}`, kind: "config", ...d })),
    ...diff({ ...base.env, git_sha: null }, { ...c.env, git_sha: null }).map((d) => ({ pair: `${base.name} vs ${c.name}`, kind: "environment", ...d })),
  ]);
  const warnings = configs.filter((c) => !c.is_baseline).flatMap((c) => confounderWarnings(base, c).map((w) => `${base.name} vs ${c.name}: ${w}`));
  const unit = ms.find((m) => m.metric === prereg.primary_metric)?.unit ?? "";
  const cappedRuns = ms.filter((m) => m.metric === prereg.primary_metric && (m.n ?? 0) > repo.SAMPLE_CAP && rows.some((r) => r.run.id === m.runId));
  const cappedNote = cappedRuns.length
    ? `Runs ${cappedRuns.map((m) => `#${m.runId} (${m.n} samples)`).join(", ")} have more than ${repo.SAMPLE_CAP.toLocaleString("en-US")} samples of ${prereg.primary_metric}; this report used only the first ${repo.SAMPLE_CAP.toLocaleString("en-US")} stored samples of each. The full sets are in the raw-data files.`
    : null;
  const payload = {
    project_id: projectId, title: p.title, hypothesis: p.hypothesis, generated_at: now.toISOString(), is_sample: false,
    prereg: { ...prereg, preregistered_at: p.preregisteredAt?.toISOString() }, amendments: amendmentsOf(p.planMd), primary_metric: prereg.primary_metric, unit,
    configs: configs.map(({ config: _c, env: _e, id: _id, ...c }) => c), diffs, confounder_warnings: warnings, confounder_checklist: CONFOUNDER_CHECKLIST,
    runs: rows.map((r) => ({ id: r.run.id, config: r.configName, status: r.run.status, is_baseline: r.run.isBaseline, is_warmup: r.run.isWarmup, env_fingerprint: r.run.envFingerprint,
      git_sha: (r.run.envJson as EnvLike).git_sha ?? null, started_at: r.run.startedAt?.toISOString() ?? "", failure_note: r.run.failureNote, command: r.run.command })),
    raw_data_note: "Raw samples for every run can be downloaded as JSON from the project page (Download raw data).",
    sample_cap_note: cappedNote,
  };
  const jobId = await enqueueJob(userId, "report.render", payload, { project_id: projectId, run_ids: rows.map((r) => r.run.id) });
  const reportId = await repo.createReport(projectId, userId, jobId, rows.map((r) => r.run.id));
  return { reportId, jobId };
}

export async function reportFile(userId: string, reportId: number, format: "md" | "html") {
  const r = await repo.reportById(reportId);
  if (!r) throw new ResearchError("NOT_FOUND", "Report not found.");
  if (r.userId !== userId) throw new ResearchError("FORBIDDEN", "Not your report.");
  if (r.status !== "done") throw new ResearchError("NOT_AVAILABLE", r.status === "failed" ? `Rendering failed: ${r.error ?? "unknown"}` : "The report is still rendering.");
  return { body: format === "md" ? r.markdown! : r.html!, filename: `report-${r.projectId}-${r.id}.${format}` };
}

/** Owner of a resource, for the AT-04 cross-user matrix. */
export async function ownerOf(kind: "project" | "run" | "report", id: number): Promise<string | undefined> {
  if (kind === "project") return (await repo.projectById(id))?.userId;
  if (kind === "run") return (await repo.runWithProject(id))?.project.userId;
  return (await repo.reportById(id))?.userId;
}

/** Sample data (FR-30, Q17): a separate is_mock project shown with the SAMPLE DATA banner; off by default, removed when off. */
export async function setSampleData(userId: string, on: boolean) {
  await repo.deleteSampleProjects(userId);
  if (on) await seedSampleProject(userId);
}

/** Analytics page data: per-run summaries (with CIs once the stats job has run), CDF/histogram and GPU timelines. */
export async function analytics(userId: string, projectId: number) {
  const pr = await project(userId, projectId);
  const gpu = Object.fromEntries(await Promise.all(pr.runs.map(async (r) => [r.id, (await repo.gpuOf(r.id)).map((g) => ({ t: g.tMs, util: g.utilPct, mem: g.memMb }))] as const)));
  return { ...pr, gpu };
}

export async function deleteRawData(userId: string) {
  await repo.removeRawData(getEnv().RAW_DATA_DIR, userId);
}

// ---------------------------------------------------------------------------------------------------------------
// P3-core: source verification and the paper library

const VERIFY_EVERY_HOURS = 20;
const SWEEP_LIMIT = 300;

/** Queues a verification of one source (worker-node, SSRF-guarded safeFetch). */
export async function requestVerification(userId: string | null, sourceId: number) {
  const s = await sourceRepo.sourceById(sourceId);
  if (!s) throw new ResearchError("NOT_FOUND", "Source not found.");
  const jobId = await enqueueJob(userId, "verify.source", { sourceId: s.id, url: s.url, kind: s.kind, externalId: s.externalId, expectedTitle: null });
  return { jobId, sourceId: s.id };
}

/** Nightly sweep (called by worker-node's schedule over HMAC): queue every source not checked for 20 h. */
export async function sweep(now = new Date()) {
  const due = await sourceRepo.dueSources(VERIFY_EVERY_HOURS, SWEEP_LIMIT, now);
  for (const s of due) await enqueueJob(null, "verify.source", { sourceId: s.id, url: s.url, kind: s.kind, externalId: s.externalId, expectedTitle: null });
  await audit(null, "verify.sweep", null, { enqueued: due.length });
  return { enqueued: due.length };
}

export async function verificationStatus() {
  return { lastCheckAt: await sourceRepo.latestCheck(), everyHours: VERIFY_EVERY_HOURS };
}

const ARXIV_ID = /^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})(v\d+)?$/i;

/**
 * Adds a paper to the library (FR-11). Its title, authors and abstract come only from the arXiv API once the
 * verification job has run; until then the entry is shown as unverified with a placeholder title (no invented data).
 */
export async function addPaper(userId: string, input: { arxivId: string } | { url: string; title: string }) {
  let url: string;
  let title: string;
  let externalId: string | null = null;
  if ("arxivId" in input) {
    const id = input.arxivId.trim().replace(/^arxiv:/i, "").replace(/v\d+$/, "");
    if (!ARXIV_ID.test(id)) throw new ResearchError("INVALID", "Request failed validation.", { fields: [{ path: "arxivId", message: "not an arXiv identifier such as 2309.06180" }] });
    url = `https://arxiv.org/abs/${id}`;
    title = `arXiv:${id} (waiting for verification)`;
    externalId = id;
  } else {
    url = new URL(input.url).href;
    title = input.title;
  }
  const hash = sha256Hex(url);
  let source = await sourceRepo.findSourceByUrlHash(hash);
  if (!source) {
    const id = await sourceRepo.insertSource({ kind: "paper", url, urlHash: hash, title, externalId, verification: "unverified", verifiedAt: null, lastCheckedAt: new Date(0),
      verifyMethod: "not checked yet", verifyNote: "added to the paper library; verification queued" });
    source = (await sourceRepo.sourceById(id))!;
  }
  const existing = await paperRepo.paperOf(userId, source.id);
  if (existing) return { paperId: existing.id, sourceId: source.id, duplicate: true, jobId: null };
  const paperId = await paperRepo.insertPaper({ userId, sourceId: source.id, title: source.verification === "verified" ? (source.title ?? title) : title,
    abstract: source.verification === "verified" ? ((source.rawJson as { abstract?: string } | null)?.abstract ?? null) : null,
    authorsJson: source.verification === "verified" ? ((source.rawJson as { authors?: string[] } | null)?.authors ?? null) : null });
  const { jobId } = await requestVerification(userId, source.id);
  return { paperId, sourceId: source.id, duplicate: false, jobId };
}

export async function papers(userId: string, q?: string) {
  return paperRepo.listPapers(userId, q);
}

export async function patchPaper(userId: string, id: number, patch: { userNotes?: string | undefined; status?: "to_read" | "read" | "analysed" | undefined }) {
  const p = await paperRepo.paperById(id);
  if (!p) throw new ResearchError("NOT_FOUND", "Paper not found.");
  if (p.userId !== userId) throw new ResearchError("FORBIDDEN", "Not your paper.");
  await paperRepo.updatePaper(id, { ...(patch.userNotes !== undefined ? { userNotes: patch.userNotes } : {}), ...(patch.status ? { status: patch.status } : {}) });
  return { id, ...patch };
}

export async function paperOwner(id: number) {
  return (await paperRepo.paperById(id))?.userId;
}
