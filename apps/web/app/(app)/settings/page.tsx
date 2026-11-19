import { githubLoginConfigured, pageUser } from "@/modules/auth/service";
import { settings } from "@/modules/learning/service";
import { verificationStatus } from "@/modules/research/service";
import { AccountDelete, JobsPanel, PlanForm, RunnerTokens, SampleDataToggle } from "./client";

export const metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await pageUser();
  const s = await settings(u.id);
  const v = await verificationStatus();
  return (
    <div className="prose-width space-y-8">
      <h1 className="text-3xl">Settings &amp; integrations</h1>
      <PlanForm mode={s.mode} hoursPerWeek={s.hoursPerWeek} timezone={s.timezone} />
      <section className="panel space-y-2" aria-labelledby="int-title">
        <h2 id="int-title" className="text-xl">Integrations</h2>
        <ul className="space-y-1">
          <li>GitHub sign-in: {githubLoginConfigured() ? "configured (read-only GitHub App)" : "not configured"}</li>
          <li>GitHub repository data: not built yet (phase P4)</li>
          <li>AI mentor: not configured (phase P5). Everything else works without it.</li>
          <li>Source verification: every night at 03:17 UTC through the SSRF-guarded fetcher; last check {v.lastCheckAt ? new Date(v.lastCheckAt).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never"}. If the stack is not running at night, lessons show sources as stale after 30 days.</li>
        </ul>
      </section>
      <RunnerTokens />
      <SampleDataToggle on={s.sampleData} />
      <JobsPanel />
      <AccountDelete />
    </div>
  );
}
