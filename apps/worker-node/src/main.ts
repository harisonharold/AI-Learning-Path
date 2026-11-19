/**
 * worker-node: consumes `atlas-node`. P3-core: source verification (verify.source) and the nightly sweep
 * (verify.sweep, a BullMQ job scheduler). worker-node holds no database credentials: results go back to web over
 * signed internal requests, exactly like worker-py.
 */
import { createServer } from "node:http";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { loadEnv } from "./env.ts";
import { postInternal } from "./hmac.ts";
import { verificationHandlers } from "./jobs.ts";

export const QUEUE = "atlas-node";
const env = loadEnv();
const log = (level: string, msg: string, fields: Record<string, unknown> = {}) =>
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields }) + "\n");

const handlers = verificationHandlers(env, log);
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker(
  QUEUE,
  async (job) => {
    const h = handlers[job.name];
    if (!h) throw new Error(`unknown job kind: ${job.name}`);
    const data = (job.data ?? {}) as { jobId?: string; input?: unknown };
    const attempts = job.attemptsMade + 1;
    try {
      const result = await h(data.input ?? {});
      if (data.jobId) {
        const res = await postInternal(env.WEB_INTERNAL_URL, env.INTERNAL_HMAC_KEY, `/api/internal/jobs/${data.jobId}/result`, { status: "done", result, attempts });
        if (!res.ok && res.status !== 409) throw new Error(`callback rejected with HTTP ${res.status}`);
      }
      return result;
    } catch (e) {
      const final = attempts >= (job.opts.attempts ?? 1);
      if (data.jobId && final) {
        await postInternal(env.WEB_INTERNAL_URL, env.INTERNAL_HMAC_KEY, `/api/internal/jobs/${data.jobId}/result`, { status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 4000), attempts }).catch(() => undefined);
      }
      throw e;
    }
  },
  { connection: redis, concurrency: 4 },
);
worker.on("failed", (job, err) => log("error", "job failed", { jobId: job?.id, kind: job?.name, error: err.message }));

// Nightly re-verification (R-02): the scheduler survives restarts in Redis; upsert keeps one schedule.
const queue = new Queue(QUEUE, { connection: redis.duplicate() });
if (env.VERIFY_CRON !== "off") {
  await queue.upsertJobScheduler("verify-nightly", { pattern: env.VERIFY_CRON, tz: "UTC" }, { name: "verify.sweep", data: {}, opts: { attempts: 3, backoff: { type: "exponential", delay: 60_000 } } });
  log("info", "verification schedule set", { cron: env.VERIFY_CRON });
} else {
  await queue.removeJobScheduler("verify-nightly");
}

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
    await queue.close();
    await redis.quit();
    process.exit(0);
  });
}
