import { pageUser } from "@/modules/auth/service";
import { diagnosticState } from "@/modules/learning/service";
import { DiagnosticRunner } from "./runner";

export const metadata = { title: "Diagnostic" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await pageUser();
  const s = await diagnosticState(u.id);
  const resume = s.session && !s.session.completedAt ? s.session : null;
  return (
    <div className="prose-width space-y-4">
      <h1 className="text-3xl">Diagnostic</h1>
      <p className="text-[var(--ink-muted)]">One task per screen. Answers save as you go and you can pause any time. &quot;I don&apos;t know&quot; is better data than a guess. Results shape your skill map and plan; only passing a gate (weeks 1-3) can skip a week.</p>
      <DiagnosticRunner items={s.items} resume={resume ? { answers: resume.state.answers, index: resume.state.index, pausedMs: resume.pausedMs, hoursPerWeek: resume.state.hoursPerWeek ?? null } : null} />
    </div>
  );
}
