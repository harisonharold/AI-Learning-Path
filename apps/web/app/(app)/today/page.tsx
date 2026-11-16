import { PageState } from "@atlas/ui";
export const metadata = { title: "Today" };
export default function Page() {
  return (
    <div className="prose-width space-y-6">
      <h1 className="text-3xl">Today</h1>
      <p className="text-[var(--ink-muted)]">Systems Atlas moves you forward only on demonstrated competence. Four to six months will not make anyone an expert, and this app cannot promise interviews, offers or pay.</p>
      <PageState state="empty" title="Nothing scheduled yet">
        <p className="mt-2">The diagnostic (about 4 hours, can pause) arrives in phase P1. It will place you and build today&apos;s plan.</p>
      </PageState>
    </div>
  );
}
