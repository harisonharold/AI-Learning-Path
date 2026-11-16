/**
 * Every app/api route must be listed here; a test fails if a route file is missing (AT-04).
 * auth: "session" routes are exercised by the cross-user matrix; "owned" marks routes that address one user's resource.
 */
export type RouteAuth = "public" | "session" | "better-auth" | "hmac";
export interface RouteSpec {
  file: string;
  methods: ("GET" | "POST" | "PUT" | "PATCH" | "DELETE")[];
  auth: RouteAuth;
  /** For owned resources: how the cross-user test builds a request against another user's resource. */
  owned?: { method: "GET" | "PATCH" | "DELETE"; resource: "job" };
}

export const ROUTES: RouteSpec[] = [
  { file: "app/api/healthz/route.ts", methods: ["GET"], auth: "public" },
  { file: "app/api/auth/[...all]/route.ts", methods: ["GET", "POST"], auth: "better-auth" },
  { file: "app/api/me/route.ts", methods: ["GET"], auth: "session" },
  { file: "app/api/jobs/route.ts", methods: ["GET", "POST"], auth: "session" },
  { file: "app/api/jobs/[id]/route.ts", methods: ["GET"], auth: "session", owned: { method: "GET", resource: "job" } },
  { file: "app/api/account/route.ts", methods: ["DELETE"], auth: "session" },
  { file: "app/api/internal/jobs/[id]/result/route.ts", methods: ["POST"], auth: "hmac" },
];
