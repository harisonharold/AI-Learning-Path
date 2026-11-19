import { z } from "zod";

/** Zod schemas for content/*.yaml (pure; no fs). Cross-references are checked in validateContent. */
export const EVIDENCE_KINDS = ["runner_result", "server_graded", "github_commit", "github_ci", "reviewer_score", "self_rubric", "report", "recording"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
/** Evidence that can satisfy an objective requirement. Browser practice checks have no evidence kind at all (D-15). */
export const COUNTING_KINDS: readonly EvidenceKind[] = ["runner_result", "server_graded", "github_commit", "github_ci", "reviewer_score"];

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const weekId = z.string().regex(/^(RI-W\d{2}|ACC-\d{2})$/);

export const RequiredEvidence = z
  .object({
    kind: z.enum(EVIDENCE_KINDS),
    label: z.string().min(3),
    ref: z.string().optional(),
    quiz: id.optional(),
    pass_pct: z.number().int().min(1).max(100).optional(),
  })
  .strict()
  .refine((e) => e.kind !== "server_graded" || (e.quiz && e.pass_pct), "server_graded evidence needs quiz and pass_pct")
  .refine((e) => e.kind !== "runner_result" || e.ref, "runner_result evidence needs ref");
export type RequiredEvidence = z.infer<typeof RequiredEvidence>;

export const Gate = z
  .object({
    id,
    kind: z.enum(["tests", "exam", "report", "defense"]),
    title: z.string(),
    objective: z.string(),
    skills: z.array(id).optional(),
    required_evidence: z.array(RequiredEvidence).min(1),
    rubric: z.array(z.object({ criterion: z.string().min(3) }).strict()).optional(),
    remediation: z.object({ track: z.string(), reattempt_after_hours: z.number().min(0), reattempt_note: z.string() }).strict().optional(),
  })
  .strict();
export type Gate = z.infer<typeof Gate>;

export const RiWeek = z
  .object({
    id: weekId,
    ordinal: z.number().int().min(1).max(24),
    title: z.string(),
    hardware: z.enum(["CPU", "GPU_FREE", "GPU_RENT"]),
    skills: z.array(id).min(1),
    no_ai_code: z.boolean().default(false),
    publish_restricted: z.boolean().default(false),
    restriction_note: z.string().optional(),
    gates: z.array(Gate).min(1),
  })
  .strict();
export type RiWeek = z.infer<typeof RiWeek>;

export const Curriculum = z
  .object({
    content_version: z.string(),
    skills: z.array(z.object({ id, name: z.string(), area: z.string() }).strict()),
    skill_edges: z.array(z.tuple([id, id])),
    advanced_from_ri_week: z.number().int(),
    advanced_requires_gates: z.array(id),
    ri_weeks: z.array(RiWeek),
    acc_weeks: z.array(z.object({ id: weekId, ordinal: z.number().int(), title: z.string(), ri: z.array(weekId).min(1) }).strict()),
    hours_estimate: z.object({ RI: z.number().positive(), ACC: z.number().positive() }).strict(),
  })
  .strict();
export type Curriculum = z.infer<typeof Curriculum>;

export const Source = z
  .object({
    id,
    kind: z.enum(["paper", "repo", "course", "doc", "price", "issue", "job", "blog"]),
    url: z.url(),
    title: z.string(),
    note: z.string().optional(),
    venue: z.string().optional(),
    year: z.number().int().optional(),
    licence: z.string().optional(),
    last_activity_at: z.coerce.date().optional(),
    verification: z.enum(["verified", "partial", "unverified", "broken"]),
    verified_at: z.coerce.date().nullable(),
    verify_method: z.string(),
  })
  .strict()
  .refine((s) => (s.verification === "unverified") === (s.verified_at === null), "unverified sources must have verified_at: null, and only they");
export type Source = z.infer<typeof Source>;

export const Card = z.object({ front: z.string().min(3), back: z.string().min(1) }).strict();
export const Lesson = z
  .object({ slug: id, week: weekId, title: z.string(), body: z.string(), resources: z.array(id), exercises: z.array(id), cards: z.array(Card) })
  .strict();
export type Lesson = z.infer<typeof Lesson>;

export const Quiz = z
  .object({
    id,
    title: z.string(),
    pass_pct: z.number().int().min(1).max(100),
    canary: z.string(),
    questions: z.array(z.object({ id, prompt: z.string(), choices: z.array(z.string()).min(2), answer: z.number().int().min(0) }).strict()).min(1),
  })
  .strict()
  .refine((q) => q.questions.every((x) => x.answer < x.choices.length), "answer index out of range");
export type Quiz = z.infer<typeof Quiz>;

export const Exercise = z
  .object({
    id,
    week: weekId,
    gate: id,
    title: z.string(),
    language: z.enum(["python", "c", "go", "cpp", "cuda"]),
    practice_runtime: z.enum(["pyodide", "none"]),
    gate_tests_ref: z.string(),
    prompt: z.string(),
    starter: z.string(),
    hints: z.array(z.string()).length(3),
  })
  .strict();
export type Exercise = z.infer<typeof Exercise>;

/** Q27: an external course grader atlas-lab may run from the learner's own pinned clone (never vendored). */
export const CourseGrader = z
  .object({
    week: z.string(),
    gate_ref: z.string().regex(/^atlas-lab:[a-z0-9-]+@[0-9]+$/),
    course: z.string(),
    repo: z.string().regex(/^(https|git):\/\//),
    pins: z.record(z.string(), z.string().regex(/^[0-9a-f]{40}$/, "pins are full commit SHAs")).refine((p) => Object.keys(p).length > 0, "at least one pinned commit"),
    licence: z.string().min(3),
    use_allowed: z.boolean(),
    grader: z.string(),
    course_rules: z.string().nullable(),
    status: z.string(),
  })
  .strict();
export type CourseGrader = z.infer<typeof CourseGrader>;

/** atlas-lab gate test bundle (content/gate-tests/<id>@<version>/bundle.yaml). Never served to the browser (X-06). */
export const GateBundle = z
  .object({
    ref: z.string().regex(/^atlas-lab:[a-z0-9-]+@[0-9]+$/),
    exercise: id,
    title: z.string(),
    image: z.string().regex(/^[a-z0-9./_-]+:[\w.-]+@sha256:[0-9a-f]{64}$/, "image must be pinned by digest (THREAT T-C2)"),
    command: z.array(z.string()).min(1),
    submission: z.string().regex(/^[\w.-]+$/),
    timeout_seconds: z.number().int().min(5).max(3600),
    memory_mb: z.number().int().min(64).max(16384),
    cpus: z.number().min(0.25).max(16),
    canary: z.string().min(8),
    files: z.array(z.string().regex(/^[\w.-]+$/)).min(1),
    tests: z.array(z.string().regex(/^test_\w+$/)).min(1),
  })
  .strict();
export type GateBundle = z.infer<typeof GateBundle>;
export type LoadedBundle = GateBundle & { fileContents: Record<string, string>; sha256: string };

const DiagItem = z.discriminatedUnion("kind", [
  z.object({ id, skill: id, kind: z.literal("mcq"), prompt: z.string(), choices: z.array(z.string()).min(2), answer: z.number().int() }).strict(),
  z.object({ id, skill: id, kind: z.literal("short_answer"), prompt: z.string() }).strict(),
  z.object({ id, skill: id, kind: z.literal("code"), prompt: z.string(), exercise: id }).strict(),
]);
export const Diagnostic = z.object({ id, canary: z.string(), items: z.array(DiagItem).min(1) }).strict();
export type Diagnostic = z.infer<typeof Diagnostic>;
export type DiagItem = z.infer<typeof DiagItem>;

export interface Content {
  curriculum: Curriculum;
  sources: Source[];
  lessons: Lesson[];
  quizzes: Map<string, Quiz>;
  exercises: Map<string, Exercise & { practiceTests: string }>;
  diagnostic: Diagnostic;
  lessonBodies: Map<string, string>;
  gateBundles: Map<string, LoadedBundle>;
  courseGraders: CourseGrader[];
}

/** Cross-reference checks. Returns a list of problems (empty = valid). */
export function validateContent(c: Content): string[] {
  const errs: string[] = [];
  const reqs = c.curriculum.ri_weeks.flatMap((w) => w.gates.flatMap((g) => g.required_evidence.map((e) => ({ week: w.id, gate: g.id, e }))));
  for (const cg of c.courseGraders) {
    const r = reqs.find((x) => x.e.kind === "runner_result" && x.e.ref === cg.gate_ref);
    if (!r) errs.push(`course grader ${cg.gate_ref} matches no runner_result requirement`);
    else if (r.week !== cg.week) errs.push(`course grader ${cg.gate_ref} is listed for ${cg.week} but the gate is in ${r.week}`);
    // Q27: if a course licence does not allow running its grader, that gate must not ask for atlas-lab evidence.
    if (!cg.use_allowed && r) errs.push(`${cg.gate_ref}: licence does not allow running the grader, so gate ${r.gate} must be manual/self-assessed`);
  }
  for (const b of c.gateBundles.values()) {
    const ex = c.exercises.get(b.exercise);
    if (!ex) errs.push(`bundle ${b.ref} names unknown exercise ${b.exercise}`);
    else if (ex.gate_tests_ref !== b.ref) errs.push(`exercise ${ex.id} points at ${ex.gate_tests_ref}, not bundle ${b.ref}`);
    const defined = new Set(Object.values(b.fileContents).flatMap((t) => [...t.matchAll(/^def (test_\w+)\(/gm)].map((m) => m[1]!)));
    const listed = new Set(b.tests);
    if (defined.size !== listed.size || [...listed].some((t) => !defined.has(t))) errs.push(`bundle ${b.ref}: tests list does not match the test functions defined`);
    if (!Object.values(b.fileContents).some((t) => t.includes(b.canary))) errs.push(`bundle ${b.ref}: canary missing from its files`);
  }
  const skills = new Set(c.curriculum.skills.map((s) => s.id));
  const sources = new Set(c.sources.map((s) => s.id));
  const riIds = new Set(c.curriculum.ri_weeks.map((w) => w.id));
  const gateIds = new Set<string>();
  for (const [a, b] of c.curriculum.skill_edges) for (const s of [a, b]) if (!skills.has(s)) errs.push(`edge uses unknown skill ${s}`);
  for (const w of c.curriculum.ri_weeks) {
    for (const s of w.skills) if (!skills.has(s)) errs.push(`${w.id}: unknown skill ${s}`);
    for (const g of w.gates) {
      if (gateIds.has(g.id)) errs.push(`duplicate gate ${g.id}`);
      gateIds.add(g.id);
      for (const s of g.skills ?? []) if (!w.skills.includes(s)) errs.push(`${g.id}: skill ${s} not in week ${w.id}`);
      for (const e of g.required_evidence) if (e.kind === "server_graded" && w.ordinal <= 3 && !c.quizzes.has(e.quiz!)) errs.push(`${g.id}: quiz ${e.quiz} missing`);
    }
  }
  const ordinals = c.curriculum.ri_weeks.map((w) => w.ordinal);
  if (new Set(ordinals).size !== ordinals.length) errs.push("duplicate RI ordinals");
  for (const g of c.curriculum.advanced_requires_gates) if (!gateIds.has(g)) errs.push(`advanced rule uses unknown gate ${g}`);
  for (const a of c.curriculum.acc_weeks) for (const r of a.ri) if (!riIds.has(r)) errs.push(`${a.id}: unknown RI week ${r}`);
  if (hasCycle(c.curriculum.skill_edges)) errs.push("skill graph has a cycle");
  for (const l of c.lessons) {
    if (!riIds.has(l.week)) errs.push(`lesson ${l.slug}: unknown week ${l.week}`);
    for (const r of l.resources) if (!sources.has(r)) errs.push(`lesson ${l.slug}: unknown source ${r}`);
    for (const e of l.exercises) if (!c.exercises.has(e)) errs.push(`lesson ${l.slug}: unknown exercise ${e}`);
    if (!c.lessonBodies.has(l.slug)) errs.push(`lesson ${l.slug}: body missing`);
  }
  for (const e of c.exercises.values()) if (!gateIds.has(e.gate)) errs.push(`exercise ${e.id}: unknown gate ${e.gate}`);
  for (const i of c.diagnostic.items) {
    if (!skills.has(i.skill)) errs.push(`diagnostic ${i.id}: unknown skill ${i.skill}`);
    if (i.kind === "mcq" && i.answer >= i.choices.length) errs.push(`diagnostic ${i.id}: answer out of range`);
    if (i.kind === "code" && !c.exercises.has(i.exercise)) errs.push(`diagnostic ${i.id}: unknown exercise ${i.exercise}`);
  }
  return errs;
}

export function hasCycle(edges: [string, string][]): boolean {
  const out = new Map<string, string[]>();
  for (const [a, b] of edges) out.set(a, [...(out.get(a) ?? []), b]);
  const state = new Map<string, 1 | 2>();
  const visit = (n: string): boolean => {
    if (state.get(n) === 1) return true;
    if (state.get(n) === 2) return false;
    state.set(n, 1);
    for (const m of out.get(n) ?? []) if (visit(m)) return true;
    state.set(n, 2);
    return false;
  };
  return [...out.keys()].some(visit);
}
