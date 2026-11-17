import { pageUser } from "@/modules/auth/service";
import { getContent, roadmap } from "@/modules/learning/service";
import { RoadmapViews } from "./views";

export const metadata = { title: "Roadmap" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await pageUser();
  const r = await roadmap(u.id);
  const c = getContent().curriculum;
  // Week-level edges derived from the skill graph (prerequisite skill's week -> dependant's week).
  const skillWeek = new Map(c.ri_weeks.flatMap((w) => w.skills.map((s) => [s, w.id] as const)));
  const toView = new Map(r.roadmap.weeks.flatMap((w) => w.riWeekIds.map((ri) => [ri, w.id] as const)));
  const edges = [...new Set(c.skill_edges.map(([a, b]) => `${toView.get(skillWeek.get(a)!)}>${toView.get(skillWeek.get(b)!)}`))]
    .map((e) => e.split(">") as [string, string]).filter(([a, b]) => a !== b);
  const lessons = new Map(getContent().lessons.map((l) => [l.week, l.slug]));
  const weeks = r.roadmap.weeks.map((w) => ({ ...w, lesson: w.riWeekIds.map((id) => lessons.get(id)).find(Boolean) ?? null }));
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">Roadmap</h1>
      <p className="prose-width text-[var(--ink-muted)]">Mode {r.mode}, {r.hoursPerWeek} h/week. Weeks unlock only when the skills they build on are passed; hours never unlock anything. Weeks 18+ also need the W12 and W15 exams.</p>
      <RoadmapViews weeks={weeks} edges={edges} gates={r.gates} estimate={{ weeks: r.estimate.weeks, finish: r.estimate.finish.toISOString().slice(0, 10), formula: r.estimate.formula, method: r.estimate.method }} />
    </div>
  );
}
