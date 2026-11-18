import Link from "next/link";
import { NotBuilt } from "@/components/NotBuilt";
export const metadata = { title: "Research" };
export default function Page() {
  return (
    <div className="space-y-4">
      <p className="panel prose-width">Your experiment projects are ready now: <Link href="/research/projects">research projects</Link> (pre-registration, runs, reports).</p>
      <NotBuilt title="Research" phase="P3" what="Source verification, the paper library and dossiers" unlock="the W8 exam (the paper library is never locked)" />
    </div>
  );
}
