import Link from "next/link";
import { PageState } from "@atlas/ui";
import { LearningMeter } from "@/components/Meter";
import { StateBadge } from "@/components/StateBadge";
import { pageUser } from "@/modules/auth/service";
import { meters, today } from "@/modules/learning/service";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await pageUser();
  const [t, m] = await Promise.all([today(u.id), meters(u.id)]);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Today</h1>
      <p className="prose-width text-[var(--ink-muted)]">Systems Atlas moves you forward only on demonstrated competence. Four to six months will not make anyone an expert, and this app cannot promise interviews, offers or pay.</p>

      {t.firstDay && (
        <PageState state="empty" title="Start with the diagnostic" action={<Link className="btn btn-primary" href="/diagnostic">Take the diagnostic (about 4 h, can pause)</Link>}>
          <p className="mt-2">It places you, recommends a mode and calendar for your hours, and shows which of weeks 1-3 you could skip by passing their gates.</p>
        </PageState>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <LearningMeter m={m.learning} />
        <section className="panel text-sm" aria-labelledby="other-meters">
          <h2 id="other-meters" className="text-lg">Other meters</h2>
          <p className="mt-2">Engineering proficiency, research quality and the hiring-readiness checklist arrive in phase P6. They stay separate; there is no combined score.</p>
        </section>
      </div>

      <section className="panel" aria-labelledby="plan-title">
        <h2 id="plan-title" className="text-xl">Today&apos;s plan <span className="num text-sm text-[var(--ink-muted)]">({t.dailyMinutes} min budget from {t.hoursPerWeek} h/week, {t.mode})</span></h2>
        {t.plan.length === 0 ? <p className="mt-2">Nothing scheduled. {t.current ? "" : "Every available week is passed or locked."}</p> : (
          <ul className="mt-3 space-y-2" data-keylist>
            {t.plan.map((p) => (
              <li key={p.href + p.title} className="flex items-center justify-between gap-3">
                <Link href={p.href} data-keylist-item>{p.title}</Link>
                <span className="num text-sm text-[var(--ink-muted)]">{p.minutes} min</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm">Due cards: <strong className="num">{t.dueCards}</strong>{t.dueCards ? <> · <Link href="/workspace">start the retrieval quiz</Link></> : null}</p>
      </section>

      {t.current && (
        <section className="panel" aria-labelledby="gate-title">
          <h2 id="gate-title" className="text-xl">Current week: {t.current.title}</h2>
          <ul className="mt-3 space-y-3">
            {t.currentGates.map((g) => (
              <li key={g.id}>
                <div className="flex flex-wrap items-center gap-2"><Link href={`/gates/${g.id}`}>{g.title}</Link><StateBadge state={g.status} /></div>
                {g.missing.length > 0 && <p className="mt-1 text-sm text-[var(--ink-muted)]">Still needed: {g.missing.join("; ")}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel text-sm" aria-labelledby="est-title">
        <h2 id="est-title" className="text-lg">Estimated finish</h2>
        <p className="num mt-1">{t.estimate.finish.toISOString().slice(0, 10)} ({t.estimate.weeks} weeks, {t.estimate.method === "planning" ? "planning estimate" : "from your pace"})</p>
        <p className="mt-1 text-[var(--ink-muted)]">{t.estimate.formula}</p>
      </section>
    </div>
  );
}
