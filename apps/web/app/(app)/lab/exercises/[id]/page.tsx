import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@atlas/ui";
import { StateBadge } from "@/components/StateBadge";
import { pageUser } from "@/modules/auth/service";
import { exercise, LearningError } from "@/modules/learning/service";
import { getEnv } from "@/modules/platform/service";
import { ExerciseWorkbench } from "./workbench";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: `Exercise ${(await params).id}` };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const u = await pageUser();
  const { id } = await params;
  const e = await exercise(u.id, id).catch((err) => { if (err instanceof LearningError) notFound(); throw err; });
  return (
    <div className="space-y-5">
      <h1 className="text-3xl">{e.title}</h1>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge kind="practice" />
        <span>Gate: <Link href={`/gates/${e.gateId}`}>{e.gateTitle}</Link></span> <StateBadge state={e.gateStatus} />
      </div>
      <p className="prose-width whitespace-pre-line">{e.prompt}</p>
      <section className="panel prose-width text-sm" aria-labelledby="count-title">
        <h2 id="count-title" className="text-lg">Making it count</h2>
        <p className="mt-1">Browser results are practice checks: the tests are visible and nothing here counts toward the gate. The counting run uses hidden tests in Docker on your machine:</p>
        <pre className="num mt-2 rounded bg-[var(--surface-2)] p-2">atlas-lab run {e.id}</pre>
        <p className="mt-1 text-[var(--ink-muted)]">atlas-lab arrives in phase P2.</p>
      </section>
      {e.practiceRuntime === "pyodide"
        ? <ExerciseWorkbench id={e.id} starter={e.starter} tests={e.practiceTests} sandboxOrigin={getEnv().SANDBOX_ORIGIN} hintsUsed={e.hintsUsed} hints={e.hints} gatePassed={e.gateStatus === "passed"} />
        : <p className="panel">This exercise runs only through atlas-lab (not in the browser).</p>}
    </div>
  );
}
