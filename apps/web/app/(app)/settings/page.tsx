import { githubLoginConfigured } from "@/modules/auth/service";
import { AccountDelete, JobsPanel } from "./client";

export const metadata = { title: "Settings" };

export default function Page() {
  return (
    <div className="prose-width space-y-8">
      <h1 className="text-3xl">Settings &amp; integrations</h1>
      <section className="panel space-y-2" aria-labelledby="int-title">
        <h2 id="int-title" className="text-xl">Integrations</h2>
        <ul className="space-y-1">
          <li>GitHub sign-in: {githubLoginConfigured() ? "configured (read-only GitHub App)" : "not configured"}</li>
          <li>GitHub repository data: not built yet (phase P4)</li>
          <li>AI mentor: not configured (phase P5). Everything else works without it.</li>
        </ul>
      </section>
      <JobsPanel />
      <AccountDelete />
    </div>
  );
}
