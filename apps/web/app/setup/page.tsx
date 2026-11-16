import { redirect } from "next/navigation";
import { githubLoginConfigured } from "@/modules/auth/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configure GitHub login" };

/** AT-02: without GitHub App credentials the app shows this instead of crashing or faking a login. */
export default function Page() {
  if (githubLoginConfigured()) redirect("/signin");
  return (
    <main id="main" className="mx-auto mt-24 max-w-xl panel space-y-4">
      <h1 className="text-3xl">Configure GitHub login</h1>
      <p><strong>GitHub sign-in is not configured.</strong> Systems Atlas uses one read-only GitHub App for sign-in. Nothing is faked while it is missing.</p>
      <ol className="list-decimal space-y-1 pl-6">
        <li>Create a GitHub App with read-only permissions (manifest in <code>infra/github-app/manifest.json</code>).</li>
        <li>Set its callback URL to <code>{"<APP_ORIGIN>"}/api/auth/callback/github</code>.</li>
        <li>Put <code>GITHUB_APP_CLIENT_ID</code> and <code>GITHUB_APP_CLIENT_SECRET</code> in <code>.env</code> and restart.</li>
      </ol>
    </main>
  );
}
