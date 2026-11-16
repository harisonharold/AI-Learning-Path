/**
 * worker-node: consumes `atlas-node` (GitHub sync, mentor calls, verification arrive in later phases).
 * P0 registers no job kinds; unknown kinds fail loudly instead of being silently dropped.
 */
import { createServer } from "node:http";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { loadEnv } from "./env.ts";

export const QUEUE = "atlas-node";
export const HANDLERS: Record<string, (input: unknown) => Promise<unknown>> = {};

const env = loadEnv();
const log = (level: string, msg: string, fields: Record<string, unknown> = {}) =>
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields }) + "\n");

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const worker = new Worker(
  QUEUE,
  async (job) => {
    const h = HANDLERS[job.name];
    if (!h) throw new Error(`unknown job kind: ${job.name}`);
    return h(job.data);
  },
  { connection: redis, concurrency: 4 },
);
worker.on("failed", (job, err) => log("error", "job failed", { jobId: job?.id, error: err.message }));

createServer(async (req, res) => {
  if (req.url !== "/healthz") return void res.writeHead(404).end();
  let ok = false;
  try {
    ok = (await redis.ping()) === "PONG";
  } catch {}
  res.writeHead(ok ? 200 : 503, { "content-type": "application/json" }).end(JSON.stringify({ service: "worker-node", ok, checks: { redis: ok } }));
}).listen(env.HEALTH_PORT, () => log("info", "worker-node started", { queue: QUEUE, port: env.HEALTH_PORT }));

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, async () => {
    await worker.close();
    await redis.quit();
    process.exit(0);
  });
}
