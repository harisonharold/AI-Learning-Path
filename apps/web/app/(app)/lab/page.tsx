import Link from "next/link";
import { getContent } from "@/modules/learning/service";

export const metadata = { title: "Lab" };

export default function Page() {
  const ex = [...getContent().exercises.values()];
  return (
    <div className="prose-width space-y-4">
      <h1 className="text-3xl">Lab</h1>
      <section className="panel" aria-labelledby="ex-title">
        <h2 id="ex-title" className="text-xl">Exercises</h2>
        <ul className="mt-2 list-disc pl-6" data-keylist>{ex.map((e) => <li key={e.id}><Link href={`/lab/exercises/${e.id}`} data-keylist-item>{e.title}</Link> <span className="text-sm text-[var(--ink-muted)]">({e.week.replace("RI-W", "week ")})</span></li>)}</ul>
      </section>
      <section className="panel text-sm" aria-labelledby="proj-title">
        <h2 id="proj-title" className="text-xl">Projects, runs and benchmarks</h2>
        <ul className="mt-2 list-disc pl-6">
          <li><Link href="/research/projects">Research projects</Link>: pre-register, upload runs, generate reports.</li>
          <li><Link href="/analytics/benchmarks">Benchmark analytics</Link>: CDFs, percentiles with bootstrap CIs, GPU timelines, diffs.</li>
          <li>atlas-lab runner tokens live in <Link href="/settings">Settings</Link>.</li>
        </ul>
      </section>
    </div>
  );
}
