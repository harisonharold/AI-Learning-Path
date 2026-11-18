import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Queue } from "bullmq";
import { getDb } from "../../../db/client.ts";
import { jobs } from "../../../db/schema/index.ts";
import { getRedis } from "./redis.ts";
import { currentTraceparent } from "./telemetry.ts";

export const QUEUES = { py: "atlas-py", node: "atlas-node" } as const;
export type JobKind = "diag.echo" | "stats.summarize" | "report.render";
const KIND_QUEUE: Record<JobKind, string> = { "diag.echo": QUEUES.py, "stats.summarize": QUEUES.py, "report.render": QUEUES.py };

let queues: Map<string, Queue> | undefined;
function queue(name: string): Queue {
  queues ??= new Map();
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: getRedis().duplicate({ maxRetriesPerRequest: null }) });
    queues.set(name, q);
  }
  return q;
}

/** Creates the durable jobs row first (web is the only DB writer), then enqueues. */
/** `stored` replaces the payload in the jobs row when the queue payload is bulky (e.g. raw samples for stats). */
export async function enqueueJob(userId: string, kind: JobKind, payload: Record<string, unknown>, stored?: Record<string, unknown>) {
  const id = randomUUID();
  await getDb().insert(jobs).values({ id, userId, kind, status: "queued", payloadJson: stored ?? payload });
  const traceparent = currentTraceparent();
  await queue(KIND_QUEUE[kind]).add(kind, { jobId: id, kind, input: payload, ...(traceparent ? { traceparent } : {}) }, {
    jobId: id,
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 86_400 },
    removeOnFail: { age: 7 * 86_400 },
  });
  return id;
}

export async function getJob(id: string) {
  const rows = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return rows[0];
}

export async function listJobs(userId: string, limit: number) {
  return getDb().select().from(jobs).where(eq(jobs.userId, userId)).orderBy(desc(jobs.createdAt)).limit(limit);
}

/** Applies a callback result once: only queued/running jobs can finish. Returns false if already final. */
export async function completeJob(id: string, status: "done" | "failed", result: unknown, error: string | null, attempts: number) {
  const res = await getDb()
    .update(jobs)
    .set({ status, resultJson: result ?? null, error, attempts, finishedAt: new Date() })
    .where(and(eq(jobs.id, id), inArray(jobs.status, ["queued", "running"])));
  return (res[0] as { affectedRows: number }).affectedRows === 1;
}

export async function closeQueues() {
  await Promise.all([...(queues?.values() ?? [])].map((q) => q.close()));
  queues = undefined;
}
