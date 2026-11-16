import { redirect } from "next/navigation";
import { getSessionUser, githubLoginConfigured } from "@/modules/auth/service";
import { SignInButton } from "./SignInButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!githubLoginConfigured()) redirect("/setup");
  if (await getSessionUser()) redirect("/today");
  const { error } = await searchParams;
  return (
    <main id="main" className="mx-auto mt-24 max-w-md panel space-y-4">
      <h1 className="text-3xl">Systems Atlas</h1>
      <p>Private, single-user. Only the owner&apos;s GitHub account can sign in; nobody else can register.</p>
      {error && <p role="alert" className="text-[var(--danger)]">Sign-in was refused or failed. If this is not the owner&apos;s GitHub account, access is not possible.</p>}
      <SignInButton />
    </main>
  );
}
