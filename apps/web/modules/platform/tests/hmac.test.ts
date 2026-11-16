import { describe, expect, it } from "vitest";
import vectors from "../../../../../packages/contracts/hmac-vectors.json" with { type: "json" };
import { HEADERS, signRequest, signature, verifyRequest, type NonceStore } from "../internal/hmac.ts";

const KEY = "k".repeat(40);
const PATH = "/api/internal/jobs/0b6f7c2e-8c1a-4f0e-9b53-2a7d1e9c4f10/result";
const BODY = '{"status":"done","attempts":1}';
const NOW = 1_763_300_000_000;
const mem = (): NonceStore & { seen: Set<string> } => { const seen = new Set<string>(); return { seen, claim: async (n) => (seen.has(n) ? false : (seen.add(n), true)) }; };
const down: NonceStore = { claim: async () => { throw new Error("redis down"); } };
const req = (h: Record<string, string>, body = BODY, path = PATH) => ({ method: "POST", path, body, headers: (n: string) => h[n] ?? null });

describe("HMAC shared vectors (identical to the Python implementation)", () => {
  it.each(vectors.vectors)("$method $path", (v) => expect(signature(vectors.key, v.method, v.path, v.timestamp, v.nonce, v.body)).toBe(v.signature));
});

describe("X-10 internal HMAC (web side)", () => {
  it("accepts a valid request", async () => expect(await verifyRequest(KEY, mem(), req(signRequest(KEY, "POST", PATH, BODY, NOW)), NOW)).toEqual({ ok: true }));
  it("rejects a bad signature", async () => {
    const h = { ...signRequest(KEY, "POST", PATH, BODY, NOW), [HEADERS.sig]: "0".repeat(64) };
    expect(await verifyRequest(KEY, mem(), req(h), NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });
  it("rejects a timestamp older than 5 minutes", async () =>
    expect(await verifyRequest(KEY, mem(), req(signRequest(KEY, "POST", PATH, BODY, NOW - 301_000)), NOW)).toEqual({ ok: false, reason: "stale" }));
  it("accepts exactly 5 minutes", async () => expect((await verifyRequest(KEY, mem(), req(signRequest(KEY, "POST", PATH, BODY, NOW - 300_000)), NOW)).ok).toBe(true));
  it("rejects a timestamp more than 5 minutes in the future", async () =>
    expect(await verifyRequest(KEY, mem(), req(signRequest(KEY, "POST", PATH, BODY, NOW + 301_000)), NOW)).toEqual({ ok: false, reason: "stale" }));
  it("rejects a reused nonce, even with a fresh valid signature", async () => {
    const store = mem();
    const h = signRequest(KEY, "POST", PATH, BODY, NOW);
    expect((await verifyRequest(KEY, store, req(h), NOW)).ok).toBe(true);
    const ts = String(Math.floor(NOW / 1000) + 10);
    const nonce = h[HEADERS.nonce]!;
    const h2 = { [HEADERS.ts]: ts, [HEADERS.nonce]: nonce, [HEADERS.sig]: signature(KEY, "POST", PATH, ts, nonce, BODY) };
    expect(await verifyRequest(KEY, store, req(h2), NOW + 10_000)).toEqual({ ok: false, reason: "replayed" });
  });
  it("rejects a body altered after signing", async () =>
    expect(await verifyRequest(KEY, mem(), req(signRequest(KEY, "POST", PATH, BODY, NOW), BODY + " "), NOW)).toEqual({ ok: false, reason: "bad_signature" }));
  it("fails closed when the nonce store is unavailable", async () =>
    expect(await verifyRequest(KEY, down, req(signRequest(KEY, "POST", PATH, BODY, NOW)), NOW)).toEqual({ ok: false, reason: "nonce_store_unavailable" }));
  it("does not burn a nonce on a bad signature", async () => {
    const store = mem();
    const h = signRequest(KEY, "POST", PATH, BODY, NOW);
    await verifyRequest(KEY, store, req({ ...h, [HEADERS.sig]: "f".repeat(64) }), NOW);
    expect(store.seen.size).toBe(0);
  });
  it.each([HEADERS.ts, HEADERS.nonce, HEADERS.sig])("rejects a missing %s header", async (drop) => {
    const h: Record<string, string> = { ...signRequest(KEY, "POST", PATH, BODY, NOW) };
    delete h[drop];
    expect(await verifyRequest(KEY, mem(), req(h), NOW)).toEqual({ ok: false, reason: "missing_headers" });
  });
});
