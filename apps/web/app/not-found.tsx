import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="mx-auto mt-24 max-w-md panel space-y-3">
      <h1 className="text-3xl">404 — page not found</h1>
      <p>This page does not exist (the &ldquo;lost packet&rdquo; version arrives in P7).</p>
      <Link href="/today">Back to Today</Link>
    </main>
  );
}
