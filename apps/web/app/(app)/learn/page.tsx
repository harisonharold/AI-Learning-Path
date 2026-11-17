import Link from "next/link";
import { StateBadge } from "@/components/StateBadge";
import { pageUser } from "@/modules/auth/service";
import { getContent, roadmap } from "@/modules/learning/service";

export const metadata = { title: "Learn" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await pageUser();
  const r = await roadmap(u.id);
  const c = getContent();
  const lessonByWeek = new Map(c.lessons.map((l) => [l.week, l]));
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">Learn</h1>
      <p className="prose-width text-[var(--ink-muted)]">Lessons for weeks 1-3 are written. Later weeks list their objectives and gates; their lessons are added in later content releases. Locked weeks can be read but not attempted.</p>
      <ol className="space-y-2" data-keylist>
        {c.curriculum.ri_weeks.map((w) => {
          const l = lessonByWeek.get(w.id);
          const state = r.roadmap.weeks.find((x) => x.riWeekIds.includes(w.id))?.state ?? "locked";
          return (
            <li key={w.id} className="panel flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                {l ? <Link href={`/learn/${l.slug}`} data-keylist-item>Week {w.ordinal}: {l.title}</Link> : <span>Week {w.ordinal}: {w.title} <span className="text-xs text-[var(--ink-muted)]">(lesson not written yet)</span></span>}
                <div className="text-xs text-[var(--ink-muted)]">{w.gates.map((g) => g.title).join(" · ")}</div>
              </div>
              <StateBadge state={state} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
