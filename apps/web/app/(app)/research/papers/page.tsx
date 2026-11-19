import Link from "next/link";
import { Badge } from "@atlas/ui";
import { pageUser } from "@/modules/auth/service";
import { papers, verificationStatus } from "@/modules/research/service";
import { AddPaper, PaperNotes } from "./client";

export const metadata = { title: "Paper library" };
export const dynamic = "force-dynamic";

const day = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "never");

/** Page 10: the paper library. Never locked (Q7). Facts about a paper come only from arXiv or the fetched page. */
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await pageUser();
  const q = (await searchParams).q?.slice(0, 200) ?? "";
  const [list, status] = await Promise.all([papers(u.id, q || undefined), verificationStatus()]);
  return (
    <div className="prose-width space-y-6">
      <p className="text-sm"><Link href="/research">Research</Link></p>
      <h1 className="text-3xl">Paper library</h1>
      <p className="text-[var(--ink-muted)]">Titles, authors and abstracts come from the arXiv API, never typed in by hand. Sources are re-checked every night; last check: {day(status.lastCheckAt)}.</p>
      <form method="get" role="search" className="flex flex-wrap items-end gap-2">
        <label className="text-sm">Search titles, abstracts and your notes<input name="q" defaultValue={q} className="input ml-2 w-64" /></label>
        <button type="submit" className="btn">Search</button>
        {q && <Link href="/research/papers" className="text-sm">Clear</Link>}
      </form>
      <section aria-labelledby="list-title" className="space-y-3">
        <h2 id="list-title" className="text-xl">{q ? `Results for "${q}" (${list.length})` : `Your papers (${list.length})`}</h2>
        {list.length === 0 && <p className="panel">{q ? "No paper matches." : "No papers yet. Add one by its arXiv id below."}</p>}
        <ul className="space-y-3">{list.map((p) => (
          <li key={p.id} className="panel" data-paper={p.id} data-verification={p.verification}>
            <h3 className="text-lg"><a href={p.url} rel="noopener noreferrer" target="_blank">{p.title}</a></h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {p.verification === "verified" && <Badge kind="verified">Verified {day(p.verifiedAt)}</Badge>}
              {p.verification === "partial" && <Badge kind="unverified">Partly verified {day(p.verifiedAt)}</Badge>}
              {p.verification === "unverified" && <Badge kind="unverified">Unverified entry: waiting for the check</Badge>}
              {p.verification === "broken" && <Badge kind="stale">Check failed</Badge>}
              {p.isMock && <Badge kind="mock" />}
              <span>{p.status.replace("_", " ")}</span>
            </div>
            {Array.isArray(p.authorsJson) && p.authorsJson.length > 0 && <p className="mt-1 text-sm">{(p.authorsJson as string[]).slice(0, 8).join(", ")}{(p.authorsJson as string[]).length > 8 ? ", et al." : ""}</p>}
            {p.verification !== "verified" && p.verifyNote && <p className="mt-1 text-xs text-[var(--ink-muted)]">Last check: {p.verifyNote}</p>}
            {p.abstract && <details className="mt-2"><summary className="cursor-pointer text-sm">Abstract</summary><p className="mt-1 text-sm">{p.abstract}</p></details>}
            <PaperNotes id={p.id} notes={p.userNotes} status={p.status} />
          </li>
        ))}</ul>
      </section>
      <AddPaper />
    </div>
  );
}
