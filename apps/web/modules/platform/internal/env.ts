import { z } from "zod";

/** Env schema for the web app. Parsed lazily at runtime (not at build) and once at boot via instrumentation.ts. */
const base64Key32 = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded");

const schema = z
  .object({
    ATLAS_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_ORIGIN: z.url(),
    SANDBOX_ORIGIN: z.url(),
    DATABASE_URL: z.string().startsWith("mysql://"),
    REDIS_URL: z.string().startsWith("redis://"),
    BETTER_AUTH_SECRET: z.string().min(32),
    ALLOWED_GITHUB_USER_ID: z.string().regex(/^[1-9][0-9]{0,18}$/, "must be exactly one positive integer GitHub user id"),
    GITHUB_APP_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_APP_CLIENT_SECRET: z.string().min(1).optional(),
    TOKEN_ENC_KEY: base64Key32,
    TOKEN_ENC_KEY_ID: z.coerce.number().int().min(1).max(255).default(1),
    INTERNAL_HMAC_KEY: z.string().refine((v) => Buffer.byteLength(v) >= 32, "must be at least 32 bytes"),
    API_PY_URL: z.url().default("http://api-py:8000"),
    /** Requests per minute per client on /api/auth/*. Raised only in the e2e overlay. */
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(5).max(10_000).default(30),
    /** Sign-in starts per 10 s per client (Better Auth default 3). Raised only in the e2e overlay. */
    AUTH_SIGNIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(3),
    // Test-only overrides for the GitHub OAuth endpoints (mock server in CI). Refused outside ATLAS_ENV=test.
    GITHUB_OAUTH_AUTHORIZE_URL: z.url().optional(),
    GITHUB_OAUTH_TOKEN_URL: z.url().optional(),
    GITHUB_API_URL: z.url().optional(),
  })
  .superRefine((e, ctx) => {
    if (new URL(e.APP_ORIGIN).host === new URL(e.SANDBOX_ORIGIN).host) {
      ctx.addIssue({ code: "custom", path: ["SANDBOX_ORIGIN"], message: "must be a different host from APP_ORIGIN" });
    }
    const overrides = ["GITHUB_OAUTH_AUTHORIZE_URL", "GITHUB_OAUTH_TOKEN_URL", "GITHUB_API_URL"] as const;
    for (const k of overrides) {
      if (e[k] && e.ATLAS_ENV !== "test") {
        ctx.addIssue({ code: "custom", path: [k], message: "only allowed when ATLAS_ENV=test" });
      }
    }
    if (Boolean(e.GITHUB_APP_CLIENT_ID) !== Boolean(e.GITHUB_APP_CLIENT_SECRET)) {
      ctx.addIssue({ code: "custom", path: ["GITHUB_APP_CLIENT_SECRET"], message: "set both GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET, or neither" });
    }
  });

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  constructor(public readonly issues: { path: string; message: string }[]) {
    super(`Invalid environment: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const r = schema.safeParse(source);
  if (!r.success) {
    throw new EnvError(r.error.issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message })));
  }
  return r.data;
}

let cached: Env | undefined;
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Values that must never appear in logs, traces, responses or bundles. */
export function secretValues(env: Env): string[] {
  return [env.BETTER_AUTH_SECRET, env.TOKEN_ENC_KEY, env.INTERNAL_HMAC_KEY, env.GITHUB_APP_CLIENT_SECRET, passwordOf(env.DATABASE_URL), passwordOf(env.REDIS_URL)]
    .filter((v): v is string => typeof v === "string" && v.length >= 6);
}

function passwordOf(url: string): string | undefined {
  try {
    const p = new URL(url).password;
    return p ? decodeURIComponent(p) : undefined;
  } catch {
    return undefined;
  }
}

export function githubEndpoints(env: Env) {
  return {
    authorize: env.GITHUB_OAUTH_AUTHORIZE_URL ?? "https://github.com/login/oauth/authorize",
    token: env.GITHUB_OAUTH_TOKEN_URL ?? "https://github.com/login/oauth/access_token",
    api: env.GITHUB_API_URL ?? "https://api.github.com",
  };
}
