import Link from "next/link";
import { PageState } from "@atlas/ui";
import { pageUser } from "@/modules/auth/service";
import { diagnosticResult, getContent } from "@/modules/learning/service";
import { ApplyPlan } from "./apply";

export const metadata = { title: "Diagnostic result" };
export const dynamic = "force-dynamic";

const LEVEL_TEXT: Record<string, string> = { not_started: "No answers", developing: "Developing", competent: "Competent (from the diagnostic; verification needs a gate)" };
const LEVEL_COLOR: Record<string, string> = { not_started: "var(--surface-2)", developing: "var(--mock-bg)", competent: "var(--surface)" };

export default async function Page() {
  const u = await pageUser();
  const r = (await diagnosticResult(u.id)) as null | { levels: Record<string, string>; perSkill: Record<string, { correct: number; total: number; idk: number }>; overall: number; recommendation: { mode: "RI" | "ACC"; weeks: number; reason: string; formula: string; hoursPerWeek: number }; skips: { weekId: string; title: string; skipped: boolean; howToSkip: string | null }[] };
  if (!r) return <PageState state="empty" title="No finished diagnostic yet" action={<Link className="btn btn-primary" href="/diagnostic">Take the diagnostic</Link>} />;
  const names = new Map(getContent().curriculum.skills.map((s) => [s.id, s.name]));
  return (
    <div className="prose-width space-y-6">
      <h1 className="text-3xl">Diagnostic result</h1>
      <section className="panel" aria-labelledby="map-title">
        <h2 id="map-title" className="text-xl">Skill map</h2>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">Skill levels from the diagnostic</caption>
          <thead><tr className="text-left"><th scope="col">Skill</th><th scope="col">Correct</th><th scope="col">I don&apos;t know</th><th scope="col">Level</th></tr></thead>
          <tbody>{Object.entries(r.levels).map(([s, l]) => (
            <tr key={s} className="border-t border-[var(--border)]" style={{ background: LEVEL_COLOR[l] }}>
              <td className="py-1">{names.get(s) ?? s}</td><td className="num">{r.perSkill[s]!.correct}/{r.perSkill[s]!.total}</td><td className="num">{r.perSkill[s]!.idk}</td><td>{LEVEL_TEXT[l]}</td>
            </tr>))}</tbody>
        </table>
        <p className="mt-2 text-sm">Overall: <span className="num">{Math.round(r.overall * 100)}%</span>. Diagnostic levels are never &quot;verified&quot;; only passed gates verify a skill.</p>
      </section>
      <section className="panel" aria-labelledby="rec-title">
        <h2 id="rec-title" className="text-xl">Recommendation</h2>
        <p className="mt-2">{r.recommendation.reason}</p>
        <p className="num mt-1 text-sm">{r.recommendation.formula}</p>
        <ApplyPlan mode={r.recommendation.mode} hoursPerWeek={r.recommendation.hoursPerWeek} />
      </section>
      <section className="panel" aria-labelledby="skip-title">
        <h2 id="skip-title" className="text-xl">Can I skip weeks?</h2>
        <p className="mt-1 text-sm">Only weeks 1-3, and only by passing their gates with counting evidence.</p>
        <ul className="mt-2 space-y-2 text-sm">{r.skips.map((s) => <li key={s.weekId}><strong>{s.title}:</strong> {s.skipped ? "skipped (gate passed)" : s.howToSkip}</li>)}</ul>
      </section>
    </div>
  );
}
