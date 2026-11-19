/**
 * X-04 SSRF guard. Fixture servers run on loopback; the test resolver hands out public-looking addresses and the
 * test dialer maps a *validated* address to the fixture, so the whole pipeline (parse, resolve, check, pin, connect,
 * redirect, limits) runs for real.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkUrl, isBlockedAddress, type Resolved, safeFetch } from "../src/safe-fetch.ts";

const PUBLIC_A = "93.184.215.14";
const PUBLIC_B = "151.101.1.69";
let server: Server;
let port = 0;
const hits: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? "");
    const u = req.url ?? "/";
    if (u === "/ok") return void res.writeHead(200, { "content-type": "text/html" }).end("<title>Fine</title>ok");
    if (u === "/to-loopback") return void res.writeHead(302, { location: "http://127.0.0.1/secret" }).end();
    if (u === "/to-redis") return void res.writeHead(302, { location: "http://public.example:6379/" }).end();
    if (u.startsWith("/chain/")) {
      const n = Number(u.split("/")[2]);
      return void res.writeHead(302, { location: n > 0 ? `/chain/${n - 1}` : "/ok" }).end();
    }
    if (u === "/stall") return; // never answers
    if (u === "/big") {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      const chunk = Buffer.alloc(256 * 1024, 120);
      let sent = 0;
      const push = () => { while (sent < 4 * 1024 * 1024) { sent += chunk.length; if (!res.write(chunk)) return void res.once("drain", push); } res.end(); };
      return void push();
    }
    if (u === "/headers") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(req.headers));
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => { server.close(); });

const resolver = (map: Record<string, string[]>) => async (host: string): Promise<Resolved[]> => {
  const a = map[host];
  if (!a) throw new Error(`ENOTFOUND ${host}`);
  return a.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
};
const dialed: Resolved[] = [];
const dial = (addr: Resolved) => { dialed.push(addr); return { host: "127.0.0.1", port, tls: false }; };
const ok = { resolver: resolver({ "public.example": [PUBLIC_A] }), dial };

describe("X-04 refuses before any connection", () => {
  it.each([
    ["ftp://public.example/x", "scheme"], ["file:///etc/passwd", "scheme"], ["gopher://public.example/", "scheme"],
    ["data:text/plain,hi", "scheme"], ["javascript:alert(1)", "scheme"],
    ["https://public.example:8443/", "port"], ["http://public.example:6379/", "port"],
    ["http://a:b@public.example/", "userinfo"], ["http://user@public.example/", "userinfo"],
  ])("%s -> %s", (url, reason) => {
    const c = checkUrl(url);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe(reason);
  });

  it.each([
    "http://127.0.0.1/", "http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/", "http://127.1/",
    "http://10.1.2.3/", "http://172.16.0.1/", "http://172.31.255.255/", "http://172.28.0.5/", "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/", "http://100.64.0.1/", "http://0.0.0.0/",
    "http://[::1]/", "http://[fc00::1]/", "http://[fd12:3456::1]/", "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/", "http://[64:ff9b::7f00:1]/", "http://[::ffff:a9fe:a9fe]/",
  ])("blocked address literal %s", (url) => {
    const c = checkUrl(url);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe("blocked_address");
  });

  it.each([
    "http://localhost/", "http://LOCALHOST./", "http://api.localhost/", "http://metadata.google.internal/", "http://printer.local/",
    "http://intranet/", "http://redis/", "http://mysql/", "http://api-py/", "http://web/", "http://worker-py/", "http://worker-node/", "http://jaeger/",
  ])("blocked host name %s", (url) => {
    const c = checkUrl(url);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe("blocked_host");
  });

  it("public addresses are not blocked", () => {
    for (const ip of [PUBLIC_A, PUBLIC_B, "2606:4700::6810:84e5", "8.8.8.8"]) expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe("X-04 DNS-level checks", () => {
  it("refuses a public name whose DNS returns any blocked address", async () => {
    const r = await safeFetch("http://public.example/ok", { resolver: resolver({ "public.example": [PUBLIC_A, "10.0.0.7"] }), dial });
    expect(r).toMatchObject({ ok: false, reason: "blocked_address" });
  });
  it("refuses IPv6 DNS answers in blocked ranges", async () => {
    const r = await safeFetch("http://public.example/ok", { resolver: resolver({ "public.example": ["::ffff:127.0.0.1"] }), dial });
    expect(r).toMatchObject({ ok: false, reason: "blocked_address" });
  });
  it("DNS rebinding: connects to the address it validated, never a second answer", async () => {
    let calls = 0;
    const rebinding = async (): Promise<Resolved[]> => (calls++ === 0 ? [{ address: PUBLIC_A, family: 4 }] : [{ address: "127.0.0.1", family: 4 }]);
    dialed.length = 0;
    const r = await safeFetch("http://public.example/ok", { resolver: rebinding, dial });
    expect(r.ok).toBe(true);
    expect(calls).toBe(1);
    expect(dialed).toEqual([{ address: PUBLIC_A, family: 4 }]);
  });
});

describe("X-04 redirects, limits and headers", () => {
  it("accepts a public URL that returns 200", async () => {
    const r = await safeFetch("http://public.example/ok", ok);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body.toString()).toContain("<title>Fine</title>");
  });
  it("re-checks a redirect to http://127.0.0.1/", async () => {
    hits.length = 0;
    const r = await safeFetch("http://public.example/to-loopback", ok);
    expect(r).toMatchObject({ ok: false, reason: "blocked_address" });
    expect(hits).not.toContain("/secret");
  });
  it("re-checks a redirect to port 6379", async () => {
    expect(await safeFetch("http://public.example/to-redis", ok)).toMatchObject({ ok: false, reason: "port" });
  });
  it("follows up to 3 redirects and refuses the 4th", async () => {
    expect((await safeFetch("http://public.example/chain/2", ok)).ok).toBe(true); // 3 redirects
    expect(await safeFetch("http://public.example/chain/3", ok)).toMatchObject({ ok: false, reason: "too_many_redirects" });
  });
  it("gives up on a server that stalls past the timeout", async () => {
    const t = Date.now();
    const r = await safeFetch("http://public.example/stall", { ...ok, totalTimeoutMs: 400 });
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
    expect(Date.now() - t).toBeLessThan(3000);
  });
  it("aborts a body over the cap mid-stream", async () => {
    const r = await safeFetch("http://public.example/big", ok);
    expect(r).toMatchObject({ ok: false, reason: "too_large" });
  });
  it("sends no cookies or credentials, asks for no compression, and identifies itself", async () => {
    const r = await safeFetch("http://public.example/headers", ok);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = JSON.parse(r.body.toString()) as Record<string, string>;
    expect(h.cookie).toBeUndefined();
    expect(h.authorization).toBeUndefined();
    expect(h["accept-encoding"]).toBe("identity");
    expect(h["user-agent"]).toMatch(/^SystemsAtlasVerifier/);
    expect(h.host).toBe("public.example");
  });
  it("an unknown host is a DNS failure, not a crash", async () => {
    expect(await safeFetch("http://nowhere.example/", ok)).toMatchObject({ ok: false, reason: "dns" });
  });
});
