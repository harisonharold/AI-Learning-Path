/**
 * PLAN D-02 spike: Node BullMQ producer -> Python bullmq worker (services/worker-py) -> HMAC callback
 * verified by the TypeScript verifier. Also checks retries-to-failure and nonce replay.
 * Run: REDIS_URL=redis://127.0.0.1:16379 node spikes/bullmq-py/spike.ts  (worker-py running against the same Redis)
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { verifyRequest, type NonceStore } from "../../apps/web/modules/platform/internal/hmac.ts";

const { Queue } = createRequire(new URL("../../apps/web/package.json", import.meta.url))("bullmq") as typeof import("bullmq");
const KEY = process.env.INTERNAL_HMAC_KEY ?? "spike-key-0123456789abcdef0123456789";
const seen = new Set<string>();
const store: NonceStore = { claim: async (n) => (seen.has(n) ? false : (seen.add(n), true)) };
const results = new Map<string, { verdict: unknown; body: unknown }>();
let lastRaw: { path: string; headers: Record<string, string>; body: string } | undefined;

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)]));
    lastRaw = { path: req.url!, headers, body };
    const v = await verifyRequest(KEY, store, { method: req.method!, path: req.url!, headers: (n) => headers[n] ?? null, body });
    const id = req.url!.split("/")[4]!;
    results.set(id, { verdict: v, body: JSON.parse(body) });
    res.writeHead(v.ok ? 200 : 401).end();
  });
});
await new Promise<void>((r) => server.listen(Number(process.env.RECEIVER_PORT ?? 18080), r));

const q = new Queue("atlas-py", { connection: { url: process.env.REDIS_URL ?? "redis://127.0.0.1:16379" } });
const ok = randomUUID();
const bad = randomUUID();
await q.add("diag.echo", { jobId: ok, kind: "diag.echo", input: { message: "spike" } }, { jobId: ok, attempts: 3 });
await q.add("bogus", { jobId: bad, kind: "bogus.kind", input: {} }, { jobId: bad, attempts: 2, backoff: { type: "fixed", delay: 200 } });

const deadline = Date.now() + 30_000;
while ((!results.has(ok) || !results.has(bad)) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));

// Replay the last callback byte-for-byte: must be refused.
let replay: unknown = "not-run";
if (lastRaw) {
  replay = await verifyRequest(KEY, store, { method: "POST", path: lastRaw.path, headers: (n) => lastRaw!.headers[n] ?? null, body: lastRaw.body });
}
console.log(JSON.stringify({ ok: results.get(ok), failedAfterRetries: results.get(bad), replay }, null, 2));
await q.close();
server.close();
const pass = (results.get(ok)?.verdict as { ok: boolean })?.ok && (results.get(ok)?.body as { status: string }).status === "done"
  && (results.get(bad)?.body as { status: string; attempts: number })?.status === "failed" && (results.get(bad)?.body as { attempts: number }).attempts === 2
  && (replay as { reason?: string }).reason === "replayed";
console.log(pass ? "SPIKE PASS" : "SPIKE FAIL");
process.exit(pass ? 0 : 1);
