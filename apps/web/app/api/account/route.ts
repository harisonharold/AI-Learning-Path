import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/modules/auth/service";
import { deleteAccount, errors } from "@/modules/platform/service";

const Body = z.object({ confirm: z.literal("DELETE MY ACCOUNT") }).strict();

/** Full delete. Makes no GitHub request (Q16); returns the steps to revoke the GitHub grant by hand. */
export async function DELETE(req: Request) {
  const g = await requireUser(req, { mutation: true });
  if ("response" in g) return g.response;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return errors.invalid(body.error.issues);
  const githubRevoke = await deleteAccount(g.user.id);
  const res = NextResponse.json({ deleted: true, githubRevoke });
  res.cookies.set({ name: "better-auth.session_token", value: "", maxAge: 0, path: "/" });
  res.cookies.set({ name: "__Secure-better-auth.session_token", value: "", maxAge: 0, path: "/", secure: true });
  return res;
}
