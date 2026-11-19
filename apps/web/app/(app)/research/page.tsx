import Link from "next/link";
import { NotBuilt } from "@/components/NotBuilt";
export const metadata = { title: "Research" };
export default function Page() {
  return (
    <div className="space-y-4">
      <ul className="panel prose-width list-disc pl-8">
        <li><Link href="/research/projects">Research projects</Link>: pre-registration, runs, reports.</li>
        <li><Link href="/research/papers">Paper library</Link>: arXiv-verified papers with your notes and full-text search (never locked).</li>
      </ul>
      <NotBuilt title="Research" phase="P3" what="Dossiers, classification rules and the novelty-check log" unlock="the W8 exam (the paper library is never locked)" />
    </div>
  );
}
