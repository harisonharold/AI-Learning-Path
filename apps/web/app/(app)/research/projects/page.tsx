import Link from "next/link";
import { Badge } from "@atlas/ui";
import { pageUser } from "@/modules/auth/service";
import { settings } from "@/modules/learning/service";
import { listProjects } from "@/modules/research/service";
import { CreateProject } from "./client";

export const metadata = { title: "Research projects" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await pageUser();
  const projects = await listProjects(u.id, (await settings(u.id)).sampleData);
  return (
    <div className="prose-width space-y-6">
      <h1 className="text-3xl">Research projects</h1>
      <p className="text-[var(--ink-muted)]">Pre-register a hypothesis, upload runs with atlas-lab, compare them with bootstrap confidence intervals and generate a report that keeps every failed run.</p>
      <section className="panel" aria-labelledby="list-title">
        <h2 id="list-title" className="text-xl">Your projects</h2>
        {projects.length === 0 ? <p className="mt-2">No projects yet. Create one below, or turn on sample data in <Link href="/settings">Settings</Link> to look around.</p> : (
          <ul className="mt-2 space-y-2" data-keylist>{projects.map((p) => (
            <li key={p.id}><Link href={`/research/projects/${p.id}`} data-keylist-item>{p.title}</Link>{" "}
              <span className="text-sm text-[var(--ink-muted)]">{p.status}{p.preregistered ? ", pre-registered" : ", not pre-registered"}</span> {p.isMock && <Badge kind="mock" />}</li>
          ))}</ul>
        )}
      </section>
      <CreateProject />
    </div>
  );
}
