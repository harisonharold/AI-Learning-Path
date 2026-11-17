import "server-only";
import { headers } from "next/headers";
import { getAuth, githubLoginConfigured, GITHUB_PROVIDER_ID } from "./internal/better-auth.ts";

export { githubLoginConfigured, GITHUB_PROVIDER_ID };

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export async function getSessionUser(h?: Headers): Promise<SessionUser | null> {
  const s = await getAuth().api.getSession({ headers: h ?? (await headers()) });
  if (!s) return null;
  return { id: s.user.id, name: s.user.name, email: s.user.email, image: s.user.image ?? null };
}

/** Route handler for /api/auth/*. */
export function authHandler(req: Request): Promise<Response> {
  return getAuth().handler(req);
}

import { errors, getEnv, sameOrigin } from "../platform/service.ts";

/** Session guard for route handlers. Mutations also require a same-origin request (CSRF defence). */
export async function requireUser(req: Request, opts: { mutation?: boolean } = {}): Promise<{ user: SessionUser } | { response: Response }> {
  if (opts.mutation && !sameOrigin(req, getEnv().APP_ORIGIN)) return { response: errors.badOrigin() };
  const user = await getSessionUser(req.headers);
  return user ? { user } : { response: errors.unauthenticated() };
}

import { redirect } from "next/navigation";
/** For server pages under (app): the layout already redirects anonymous users; this narrows the type. */
export async function pageUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/signin");
  return u;
}
