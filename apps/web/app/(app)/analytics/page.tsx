import Link from "next/link";
import { LearningMeter } from "@/components/Meter";
import { StateBadge } from "@/components/StateBadge";
import { pageUser } from "@/modules/auth/service";
import { meters, roadmap } from "@/modules/learning/service";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await pageUser();
  const [m, r] = await Promise.all([meters(u.id), roadmap(u.id)]);
  const gates = Object.entries(r.gates);
  const passed = gates.filter(([, g]) => g.status === "passed").length;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Progress analytics</h1>
      <p className="prose-width text-[var(--ink-muted)]">Benchmark results live in <Link href="/analytics/benchmarks">benchmark analytics</Link> (CDFs, percentiles with bootstrap CIs, GPU timelines).</p>
      <LearningMeter m={m.learning} />
      <section className="panel" aria-labelledby="gates-title">
        <h2 id="gates-title" className="text-xl">Gate history</h2>
        <p className="mt-1 text-sm">Summary: {passed} of {gates.length} gates passed in total; {r.gatesPassed} of {r.gatesInMode} in your {r.mode} plan.</p>
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">Every gate and its status</caption>
          <thead><tr className="text-left"><th scope="col">Gate</th><th scope="col">Kind</th><th scope="col">Status</th></tr></thead>
          <tbody>{gates.filter(([, g]) => g.status !== "not_started").map(([id, g]) => (
            <tr key={id} className="border-t border-[var(--border)]"><td className="py-1">{g.title}</td><td>{g.kind}</td><td><StateBadge state={g.status} />{g.selfAssessed ? " (self-assessed)" : ""}</td></tr>
          ))}</tbody>
        </table>
        {gates.every(([, g]) => g.status === "not_started") && <p className="mt-2 text-sm">No gate attempts yet.</p>}
      </section>
      <section className="panel text-sm" aria-labelledby="est-title">
        <h2 id="est-title" className="text-xl">Calendar estimate</h2>
        <p className="mt-1">{r.estimate.formula}</p>
      </section>
    </div>
  );
}
