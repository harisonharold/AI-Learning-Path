/**
 * safeFetch: the only outbound HTTP helper for verifying user- or seed-supplied URLs (PLAN D-17, THREAT T-V1, X-04).
 *
 * 1. Scheme http/https only; port 80 or 443 only; no userinfo.
 * 2. Host parsed by the WHATWG URL parser (which normalises decimal/octal/hex IPv4). localhost, *.localhost,
 *    *.internal, *.local, single-label names and Compose service names are refused.
 * 3. DNS is resolved once per hop and EVERY address is checked against the blocklist (private, loopback, link-local,
 *    CGNAT, multicast, reserved, documentation, IPv4-mapped / NAT64 / compat IPv6 forms, the pinned Compose subnet).
 * 4. The socket connects to the address that was validated (no second lookup, so DNS rebinding can't switch it).
 * 5. Redirects are followed by hand, at most 3, and every hop is checked again.
 * 6. 5 s connect timeout, 10 s total; body capped at 2 MB, aborted mid-stream; no compression accepted; no cookies or
 *    credentials are ever sent. Proxies are not supported on purpose: they would bypass the address pinning.
 */
import http from "node:http";
import https from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP, isIPv4 } from "node:net";

export const COMPOSE_SERVICES = ["web", "worker-node", "api-py", "worker-py", "mysql", "redis", "jaeger", "caddy", "mock-github"] as const;

export type BlockReason =
  | "bad_url" | "scheme" | "port" | "userinfo" | "blocked_host" | "blocked_address" | "dns"
  | "timeout" | "too_large" | "too_many_redirects" | "network";

export interface Resolved { address: string; family: 4 | 6 }
export type Resolver = (host: string) => Promise<Resolved[]>;
/** Test hook only: where to actually connect for a validated address (lets fixtures run on loopback). */
export type Dialer = (validated: Resolved, port: number) => { host: string; port: number; tls?: boolean };

export interface SafeFetchOptions {
  maxBytes?: number;
  connectTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxRedirects?: number;
  resolver?: Resolver;
  dial?: Dialer;
  accept?: string;
}

export type SafeFetchResult =
  | { ok: true; status: number; finalUrl: string; headers: Record<string, string>; body: Buffer; redirects: string[] }
  | { ok: false; reason: BlockReason; detail: string; finalUrl: string; redirects: string[] };

export const USER_AGENT = "SystemsAtlasVerifier/1.0 (source verification; no tracking)";

const v4 = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["172.28.0.0", 16], // the pinned Compose subnet (already inside 172.16/12; named so the intent is explicit)
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) v4.addSubnet(net, prefix, "ipv4");

const v6 = new BlockList();
for (const [net, prefix] of [
  ["::", 96], // unspecified, loopback and the deprecated IPv4-compatible range
  ["::ffff:0:0", 96], // IPv4-mapped (also checked through the embedded IPv4 address)
  ["64:ff9b::", 96], ["64:ff9b:1::", 48], // NAT64
  ["100::", 64], ["2001::", 32], ["2001:db8::", 32], ["2002::", 16], // discard, Teredo, documentation, 6to4
  ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) v6.addSubnet(net, prefix, "ipv6");

/** Expands an IPv6 literal to 8 groups of 16 bits (accepts an embedded dotted IPv4 tail). */
function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0]!;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) {
    const p = dotted[1]!.split(".").map(Number);
    s = s.slice(0, -dotted[1]!.length) + ((p[0]! << 8) | p[1]!).toString(16) + ":" + ((p[2]! << 8) | p[3]!).toString(16);
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const missing = 8 - h.length - t.length;
  if (tail === undefined ? h.length !== 8 : missing < 0) return null;
  const groups = [...h, ...Array<string>(tail === undefined ? 0 : missing).fill("0"), ...t].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

export function isBlockedAddress(ip: string): boolean {
  if (isIPv4(ip)) return v4.check(ip, "ipv4");
  if (isIP(ip) !== 6) return true;
  const g = ipv6Groups(ip);
  if (!g) return true;
  // Any IPv6 form that carries an IPv4 address in its low 32 bits (mapped, NAT64, compat) is judged by that address too.
  const embedded = `${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`;
  const mapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff;
  const nat64 = g[0] === 0x64 && g[1] === 0xff9b;
  if ((mapped || nat64) && v4.check(embedded, "ipv4")) return true;
  return v6.check(ip, "ipv6");
}

export function hostRefusal(hostname: string): string | null {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (!h) return "empty host";
  if (h === "localhost" || h.endsWith(".localhost")) return "localhost";
  if (h.endsWith(".internal") || h.endsWith(".local")) return "internal name";
  if ((COMPOSE_SERVICES as readonly string[]).includes(h)) return "service name";
  if (!h.includes(".")) return "single-label name";
  return null;
}

type Checked = { ok: true; url: URL; host: string; port: number; literal: string | null } | { ok: false; reason: BlockReason; detail: string };

/** Static checks that need no DNS. */
export function checkUrl(raw: string): Checked {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "bad_url", detail: "not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "scheme", detail: `scheme ${url.protocol} is not allowed` };
  if (url.username || url.password) return { ok: false, reason: "userinfo", detail: "credentials in the URL are not allowed" };
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443) return { ok: false, reason: "port", detail: `port ${port} is not allowed` };
  const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  if (isIP(host)) {
    return isBlockedAddress(host) ? { ok: false, reason: "blocked_address", detail: `address ${host} is not public` } : { ok: true, url, host, port, literal: host };
  }
  const refusal = hostRefusal(host);
  if (refusal) return { ok: false, reason: "blocked_host", detail: `${host}: ${refusal}` };
  return { ok: true, url, host, port, literal: null };
}

const systemResolver: Resolver = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((a) => ({ address: a.address, family: a.family as 4 | 6 }));

async function resolveChecked(c: Extract<Checked, { ok: true }>, resolver: Resolver): Promise<{ ok: true; addr: Resolved } | { ok: false; reason: BlockReason; detail: string }> {
  if (c.literal) return { ok: true, addr: { address: c.literal, family: isIPv4(c.literal) ? 4 : 6 } };
  let addrs: Resolved[];
  try {
    addrs = await resolver(c.host);
  } catch (e) {
    return { ok: false, reason: "dns", detail: `DNS lookup failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!addrs.length) return { ok: false, reason: "dns", detail: "no addresses" };
  const bad = addrs.find((a) => isBlockedAddress(a.address));
  if (bad) return { ok: false, reason: "blocked_address", detail: `${c.host} resolves to non-public address ${bad.address}` };
  return { ok: true, addr: addrs[0]! };
}

function requestOnce(c: Extract<Checked, { ok: true }>, addr: Resolved, o: Required<Pick<SafeFetchOptions, "maxBytes" | "connectTimeoutMs" | "accept">> & { dial?: Dialer | undefined; signal: AbortSignal }) {
  return new Promise<{ ok: true; status: number; headers: Record<string, string>; body: Buffer } | { ok: false; reason: BlockReason; detail: string }>((resolve) => {
    const target = o.dial ? o.dial(addr, c.port) : { host: addr.address, port: c.port, tls: c.url.protocol === "https:" };
    const tls = target.tls ?? c.url.protocol === "https:";
    const lib = tls ? https : http;
    let settled = false;
    const done = (r: Parameters<typeof resolve>[0]) => { if (!settled) { settled = true; clearTimeout(connectTimer); resolve(r); } };
    const req = lib.request({
      method: "GET",
      host: c.host, // Host header and TLS SNI / certificate check use the real name
      servername: isIP(c.host) ? undefined : c.host,
      port: target.port,
      path: `${c.url.pathname}${c.url.search}`,
      // Connect to the validated address only.
      lookup: (_h: string, opts: { all?: boolean }, cb: (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void) => {
        const answer = (address: string) => {
          const family = isIP(address) || 4;
          if (opts?.all) cb(null, [{ address, family }]);
          else cb(null, address, family);
        };
        // Production: target.host is the validated IP. Only the test dialer can name a host (a Compose mock server).
        if (isIP(target.host)) answer(target.host);
        else dnsLookup(target.host).then((a) => answer(a.address), (e: Error) => cb(e, ""));
      },
      setHost: false,
      headers: { host: c.url.host, "user-agent": USER_AGENT, accept: o.accept, "accept-encoding": "identity", connection: "close" },
      signal: o.signal,
      agent: false,
    } as https.RequestOptions);
    const connectTimer = setTimeout(() => { req.destroy(); done({ ok: false, reason: "timeout", detail: `no connection within ${o.connectTimeoutMs} ms` }); }, o.connectTimeoutMs);
    req.on("socket", (s) => s.once(tls ? "secureConnect" : "connect", () => clearTimeout(connectTimer)));
    req.on("response", (res) => {
      clearTimeout(connectTimer);
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > o.maxBytes) {
          res.destroy();
          req.destroy();
          done({ ok: false, reason: "too_large", detail: `body exceeded ${o.maxBytes} bytes` });
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers[k] = Array.isArray(v) ? v.join(", ") : v;
        done({ ok: true, status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks) });
      });
      res.on("error", (e) => done({ ok: false, reason: o.signal.aborted ? "timeout" : "network", detail: e.message }));
    });
    req.on("error", (e) => done({ ok: false, reason: o.signal.aborted ? "timeout" : "network", detail: o.signal.aborted ? "total timeout exceeded" : e.message }));
    req.end();
  });
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const maxRedirects = opts.maxRedirects ?? 3;
  const resolver = opts.resolver ?? systemResolver;
  const ctrl = new AbortController();
  const total = setTimeout(() => ctrl.abort(), opts.totalTimeoutMs ?? 10_000);
  const redirects: string[] = [];
  let current = rawUrl;
  try {
    for (let hop = 0; ; hop++) {
      const c = checkUrl(current);
      if (!c.ok) return { ok: false, reason: c.reason, detail: c.detail, finalUrl: current, redirects };
      current = c.url.href;
      const r = await resolveChecked(c, resolver);
      if (!r.ok) return { ok: false, reason: r.reason, detail: r.detail, finalUrl: current, redirects };
      if (ctrl.signal.aborted) return { ok: false, reason: "timeout", detail: "total timeout exceeded", finalUrl: current, redirects };
      const res = await requestOnce(c, r.addr, { maxBytes, connectTimeoutMs: opts.connectTimeoutMs ?? 5_000, accept: opts.accept ?? "text/html,application/xhtml+xml,application/json,application/atom+xml;q=0.9,*/*;q=0.5", dial: opts.dial, signal: ctrl.signal });
      if (!res.ok) return { ok: false, reason: res.reason, detail: res.detail, finalUrl: current, redirects };
      const location = res.headers.location;
      if (res.status >= 300 && res.status < 400 && location) {
        if (hop + 1 > maxRedirects) return { ok: false, reason: "too_many_redirects", detail: `more than ${maxRedirects} redirects`, finalUrl: current, redirects };
        redirects.push(current);
        try {
          current = new URL(location, current).href;
        } catch {
          return { ok: false, reason: "bad_url", detail: "redirect to an invalid URL", finalUrl: current, redirects };
        }
        continue;
      }
      return { ok: true, status: res.status, finalUrl: current, headers: res.headers, body: res.body, redirects };
    }
  } finally {
    clearTimeout(total);
  }
}
