import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@atlas/ui";
import { headings, LessonBody } from "@/components/lesson/render";
import { StateBadge } from "@/components/StateBadge";
import { pageUser } from "@/modules/auth/service";
import { lesson, LearningError } from "@/modules/learning/service";
import { getEnv } from "@/modules/platform/service";
import { AddCards, ReportLink } from "./client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: `Lesson ${(await params).slug}` };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const u = await pageUser();
  const { slug } = await params;
  const l = await lesson(u.id, slug).catch((e) => { if (e instanceof LearningError) notFound(); throw e; });
  const outline = headings(l.body);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_14rem]">
      <article className="prose-width">
        <p className="text-sm text-[var(--ink-muted)]">{l.weekId.replace("RI-W", "Week ")} · <StateBadge state={l.weekState} /></p>
        <h1 className="mt-2 text-3xl">{l.title}</h1>
        {l.weekState === "locked" && <p role="note" className="panel mt-4 text-sm">You can read this lesson, but its gate unlocks after: {l.lockedBy.join("; ")}.</p>}
        <div className="lesson mt-6 leading-relaxed"><LessonBody source={l.body} sandboxOrigin={getEnv().SANDBOX_ORIGIN} /></div>

        <section aria-labelledby="cards-title" className="mt-10">
          <h2 id="cards-title" className="text-2xl">Must-know cards</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Added cards appear in your daily retrieval quiz once you move past this week (FSRS, target retention 0.9).</p>
          <AddCards slug={l.slug} total={l.cards.length} inDeck={l.cards.filter((c) => c.inDeck).length} />
          <details className="mt-3"><summary>Show all {l.cards.length} cards</summary>
            <dl className="mt-2 space-y-2 text-sm">{l.cards.map((c) => <div key={c.front}><dt className="font-medium">{c.front}</dt><dd className="text-[var(--ink-muted)]">{c.back}</dd></div>)}</dl>
          </details>
        </section>

        <section aria-labelledby="res-title" className="mt-10">
          <h2 id="res-title" className="text-2xl">Resources</h2>
          <ul className="mt-3 space-y-3">
            {l.resources.map((r) => (
              <li key={r.id} data-resource={r.id} data-freshness={r.freshness}>
                <a href={r.url} rel="noopener noreferrer" target="_blank">{r.title}</a>
                {r.note && <span className="text-sm text-[var(--ink-muted)]"> — {r.note}</span>}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  {r.freshness === "fresh" && <Badge kind="verified">Verified {r.verifiedAt ? new Date(r.verifiedAt).toISOString().slice(0, 10) : ""}</Badge>}
                  {r.freshness === "stale" && <Badge kind="stale">Stale — verified {r.verifiedAt ? new Date(r.verifiedAt).toISOString().slice(0, 10) : ""}, re-check</Badge>}
                  {r.freshness === "unverified" && <Badge kind="unverified">Unverified</Badge>}
                  {r.freshness === "broken" && <Badge kind="stale">Broken link</Badge>}
                  {r.sourceId && <ReportLink sourceId={r.sourceId} />}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="next-title" className="mt-10">
          <h2 id="next-title" className="text-2xl">Practice and gate</h2>
          <ul className="mt-2 list-disc pl-6">
            {l.exercises.map((e) => <li key={e.id}><Link href={`/lab/exercises/${e.id}`}>Practice: {e.title}</Link></li>)}
            {l.gates.map((g) => <li key={g.id}><Link href={`/gates/${g.id}`}>Gate: {g.title}</Link></li>)}
          </ul>
        </section>
      </article>
      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-6 text-sm">
          <p className="font-medium">On this page</p>
          <ul className="mt-2 space-y-1">{outline.map((h) => <li key={h.id}><a href={`#${h.id}`}>{h.text}</a></li>)}<li><a href="#cards-title">Must-know cards</a></li><li><a href="#res-title">Resources</a></li></ul>
        </div>
      </nav>
    </div>
  );
}
