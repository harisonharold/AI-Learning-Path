import { z } from "zod";

const schema = z.object({
  REDIS_URL: z.string().startsWith("redis://"),
  INTERNAL_HMAC_KEY: z.string().refine((v) => Buffer.byteLength(v) >= 32, "must be at least 32 bytes"),
  HEALTH_PORT: z.coerce.number().int().default(8002),
});
export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const r = schema.safeParse(source);
  if (!r.success) {
    for (const i of r.error.issues) process.stderr.write(JSON.stringify({ level: "fatal", msg: "invalid environment", var: i.path.join("."), problem: i.message }) + "\n");
    process.exit(78);
  }
  return r.data;
}
