import { z } from "zod";

const jsonMap = z.string().transform((s, ctx) => {
  try {
    const v = JSON.parse(s) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string")) return v as Record<string, string>;
  } catch { /* fall through */ }
  ctx.addIssue({ code: "custom", message: "must be a JSON object of strings" });
  return z.NEVER;
});

const schema = z
  .object({
    ATLAS_ENV: z.enum(["development", "test", "production"]).default("development"),
    REDIS_URL: z.string().startsWith("redis://"),
    INTERNAL_HMAC_KEY: z.string().refine((v) => Buffer.byteLength(v) >= 32, "must be at least 32 bytes"),
    HEALTH_PORT: z.coerce.number().int().default(8002),
    WEB_INTERNAL_URL: z.url().default("http://web:3000"),
    // Nightly re-verification (UTC cron). Empty disables the schedule.
    VERIFY_CRON: z.string().default("17 3 * * *"),
    // Test-only (ATLAS_ENV=test): API base URLs and a DNS/dial map so e2e can verify against the in-repo mock server.
    ARXIV_API_URL: z.url().optional(),
    GITHUB_API_URL: z.url().optional(),
    VERIFY_TEST_DNS: jsonMap.optional(),
    VERIFY_TEST_DIAL: jsonMap.optional(),
  })
  .superRefine((e, ctx) => {
    if (e.ATLAS_ENV !== "test") {
      for (const k of ["ARXIV_API_URL", "GITHUB_API_URL", "VERIFY_TEST_DNS", "VERIFY_TEST_DIAL"] as const) {
        if (e[k] !== undefined) ctx.addIssue({ code: "custom", path: [k], message: "is only allowed when ATLAS_ENV=test (it would weaken the SSRF guard)" });
      }
    }
  });
export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>) {
  return schema.safeParse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== "")));
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const r = parseEnv(source);
  if (!r.success) {
    for (const i of r.error.issues) process.stderr.write(JSON.stringify({ level: "fatal", msg: "invalid environment", var: i.path.join("."), problem: i.message }) + "\n");
    process.exit(78);
  }
  return r.data;
}
