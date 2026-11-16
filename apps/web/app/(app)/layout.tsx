import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { getSessionUser, githubLoginConfigured } from "@/modules/auth/service";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!githubLoginConfigured()) redirect("/setup");
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  return <Shell user={{ name: user.name }}>{children}</Shell>;
}
