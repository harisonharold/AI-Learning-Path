/**
 * Every app/api route must be listed here; a test fails if a route file is missing (AT-04).
 * "owned" routes address one user's resource; the cross-user matrix calls them with another user's id and expects 403.
 */
export type RouteAuth = "public" | "session" | "better-auth" | "hmac";
export type OwnedResource = "job" | "card" | "attempt";
export interface RouteSpec {
  file: string;
  methods: ("GET" | "POST" | "PUT" | "PATCH" | "DELETE")[];
  auth: RouteAuth;
  owned?: { method: "GET" | "POST" | "PATCH" | "DELETE"; resource: OwnedResource; body?: unknown };
}

export const ROUTES: RouteSpec[] = [
  { file: "app/api/healthz/route.ts", methods: ["GET"], auth: "public" },
  { file: "app/api/auth/[...all]/route.ts", methods: ["GET", "POST"], auth: "better-auth" },
  { file: "app/api/me/route.ts", methods: ["GET"], auth: "session" },
  { file: "app/api/jobs/route.ts", methods: ["GET", "POST"], auth: "session" },
  { file: "app/api/jobs/[id]/route.ts", methods: ["GET"], auth: "session", owned: { method: "GET", resource: "job" } },
  { file: "app/api/account/route.ts", methods: ["DELETE"], auth: "session" },
  { file: "app/api/internal/jobs/[id]/result/route.ts", methods: ["POST"], auth: "hmac" },
  // P1 learning core
  { file: "app/api/roadmap/route.ts", methods: ["GET"], auth: "session" },
  { file: "app/api/today/route.ts", methods: ["GET"], auth: "session" },
  { file: "app/api/quiz/route.ts", methods: ["GET"], auth: "session" },
  { file: "app/api/cards/route.ts", methods: ["POST"], auth: "session" },
  { file: "app/api/cards/[id]/review/route.ts", methods: ["POST"], auth: "session", owned: { method: "POST", resource: "card", body: { rating: 3 } } },
  { file: "app/api/lessons/[slug]/route.ts", methods: ["GET"], auth: "session" },
  { file: "app/api/gates/[id]/route.ts", methods: ["GET"], auth: "session" },
  { file: "app/api/gates/[id]/attempts/route.ts", methods: ["POST"], auth: "session" },
  { file: "app/api/attempts/[id]/rubric/route.ts", methods: ["POST"], auth: "session", owned: { method: "POST", resource: "attempt", body: { scores: [{ criterion: "Bug identified precisely", level: "strong" }] } } },
  { file: "app/api/exercises/[id]/route.ts", methods: ["GET"], auth: "session" },
  { file: "app/api/exercises/[id]/hints/route.ts", methods: ["POST"], auth: "session" },
  { file: "app/api/exercises/[id]/practice/route.ts", methods: ["POST"], auth: "session" },
  { file: "app/api/exercises/[id]/solution/route.ts", methods: ["GET"], auth: "session" },
  { file: "app/api/analytics/meters/route.ts", methods: ["GET"], auth: "session" },
  { file: "app/api/diagnostic/route.ts", methods: ["GET"], auth: "session" },
  { file: "app/api/diagnostic/attempts/route.ts", methods: ["POST"], auth: "session" },
  { file: "app/api/diagnostic/result/route.ts", methods: ["GET"], auth: "session" },
  { file: "app/api/settings/route.ts", methods: ["GET", "PUT"], auth: "session" },
  { file: "app/api/time-logs/route.ts", methods: ["POST"], auth: "session" },
  { file: "app/api/sources/[id]/report/route.ts", methods: ["POST"], auth: "session" },
];
