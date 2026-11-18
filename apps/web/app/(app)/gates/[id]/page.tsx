import { notFound } from "next/navigation";
import { Badge } from "@atlas/ui";
import { StateBadge } from "@/components/StateBadge";
import { pageUser } from "@/modules/auth/service";
import { gate, getContent, LearningError } from "@/modules/learning/service";
import { ArtifactForm, QuizForm, RubricForm } from "./client";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: `Gate ${(await params).id}` };
}

/** The atlas-lab command for a runner requirement, or an honest note when its hidden tests aren't published yet. */
function runnerHint(ref: string | undefined): string {
  const c = getContent();
  if (!ref || !c.gateBundles.has(ref)) return "The hidden tests for this requirement are not published yet; they arrive with this week's lessons.";
  const ex = [...c.exercises.values()].find((e) => e.gate_tests_ref === ref);
  return `Command: atlas-lab run ${ex ? ex.id : ref}`;
}

const SOURCE_NOTE: Record<string, string> = {
  runner_result: "Hidden tests run by atlas-lab in Docker (no network) on your machine, then uploaded.",
  server_graded: "Graded on the server; answers never reach the browser.",
  github_commit: "Verified through the read-only GitHub API (arrives in P4).",
  github_ci: "Verified through the read-only GitHub API (arrives in P4).",
  report: "A link to your write-up at a commit; scored with the rubric.",
  recording: "A reference only; the recording stays on your machine.",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const u = await pageUser();
  const { id } = await params;
  const g = await gate(u.id, id).catch((e) => { if (e instanceof LearningError) notFound(); throw e; });
  const locked = g.weekState === "locked";
  return (
    <div className="prose-width space-y-6">
      <p className="text-sm text-[var(--ink-muted)]">{g.weekTitle} · {g.kind}</p>
      <h1 className="text-3xl">{g.title}</h1>
      <div className="flex flex-wrap gap-2"><StateBadge state={g.status} />{g.evaluation.rubric.selfAssessed && <Badge kind="self" />}</div>
      <p>{g.objective}</p>
      {g.noAiCode && <p role="note" className="text-sm text-[var(--ink-muted)]">Foundation week: the mentor may ask questions and point to docs, but will not write solution code longer than 3 lines.</p>}
      {g.publishRestricted && <p role="note" className="text-sm text-[var(--ink-muted)]">{g.restrictionNote}</p>}
      {locked && <p role="note" className="panel">Locked. Unlocks after: {g.lockedBy.join("; ")}. Hours logged never unlock a gate.</p>}
      {g.remediation && (
        <section role="note" className="panel" aria-labelledby="rem-title">
          <h2 id="rem-title" className="text-xl">Remediation</h2>
          <p className="mt-1">A requirement failed. Work through the remediation track, then re-attempt{g.remediation.reattemptAfter ? <> after <span className="num">{new Date(g.remediation.reattemptAfter).toISOString().replace("T", " ").slice(0, 16)} UTC</span></> : ""}. Only weeks that depend on this skill stay locked.</p>
        </section>
      )}

      <section aria-labelledby="req-title" className="panel">
        <h2 id="req-title" className="text-xl">Required evidence</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">Only counting evidence passes a gate: atlas-lab results, server-graded answers, GitHub-verified items or reviewer scores. Browser practice checks never count.</p>
        <ul className="mt-3 space-y-3">
          {g.evaluation.requirements.map((r) => (
            <li key={r.requirement.label} data-requirement={r.requirement.kind} data-satisfied={r.satisfied}>
              <div className="flex flex-wrap items-center gap-2"><span>{r.requirement.label}</span><StateBadge state={r.satisfied ? "passed" : r.failed ? "failed" : "pending_evidence"} /></div>
              <p className="text-xs text-[var(--ink-muted)]">{SOURCE_NOTE[r.requirement.kind]} Status: {r.reason}.{r.requirement.kind === "runner_result" ? ` ${runnerHint(r.requirement.ref)}` : ""}</p>
            </li>
          ))}
        </ul>
      </section>

      {!locked && g.status !== "passed" && (
        <>
          {g.quizzes.map((q) => (q.questions.length ? <QuizForm key={q.id} gateId={g.id} quiz={q} /> : <p key={q.id} className="panel text-sm">{q.title}.</p>))}
          {g.evaluation.requirements.some((r) => ["report", "recording", "github_commit"].includes(r.requirement.kind)) && (
            <ArtifactForm gateId={g.id} kinds={[...new Set(g.evaluation.requirements.map((r) => r.requirement.kind).filter((k) => ["report", "recording", "github_commit"].includes(k)))]} />
          )}
          {g.rubric.length > 0 && g.attemptId && <RubricForm attemptId={g.attemptId} criteria={g.rubric} current={g.evaluation.rubric.byCriterion} />}
          {g.rubric.length > 0 && !g.attemptId && <p className="text-sm text-[var(--ink-muted)]">Add evidence first; then you can score the rubric.</p>}
        </>
      )}
    </div>
  );
}
