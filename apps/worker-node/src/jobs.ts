import type { Env } from "./env.ts";
import { postInternal } from "./hmac.ts";
import type { Dialer, Resolver, SafeFetchOptions } from "./safe-fetch.ts";
import { DEFAULT_ENDPOINTS, verifySource, type VerifyInput } from "./verify.ts";

type Log = (level: string, msg: string, fields?: Record<string, unknown>) => void;

/** Test-only fetch hooks (env loader refuses them outside ATLAS_ENV=test): fixed DNS answers and a dial map. */
export function testFetchOptions(env: Env): SafeFetchOptions {
  if (env.ATLAS_ENV !== "test") return {};
  const o: SafeFetchOptions = {};
  if (env.VERIFY_TEST_DNS) {
    const dns = env.VERIFY_TEST_DNS;
    const resolver: Resolver = async (host) => {
      const ip = dns[host];
      if (!ip) throw new Error(`ENOTFOUND ${host} (test DNS)`);
      return [{ address: ip, family: ip.includes(":") ? 6 : 4 }];
    };
    o.resolver = resolver;
  }
  if (env.VERIFY_TEST_DIAL) {
    const map = env.VERIFY_TEST_DIAL;
    const dial: Dialer = (addr, port) => {
      const t = map[addr.address];
      if (!t) return { host: addr.address, port };
      const [host, p] = t.split(":");
      return { host: host!, port: Number(p), tls: false };
    };
    o.dial = dial;
  }
  return o;
}

export function verificationHandlers(env: Env, log: Log): Record<string, (input: unknown) => Promise<unknown>> {
  const endpoints = { arxiv: env.ARXIV_API_URL ?? DEFAULT_ENDPOINTS.arxiv, github: env.GITHUB_API_URL ?? DEFAULT_ENDPOINTS.github };
  const fetchOptions = testFetchOptions(env);
  return {
    "verify.source": async (input) => {
      const i = input as VerifyInput & { sourceId: number };
      const result = await verifySource(i, { endpoints, fetchOptions });
      log("info", "source verified", { sourceId: i.sourceId, verification: result.verification });
      return { sourceId: i.sourceId, ...result };
    },
    "verify.sweep": async () => {
      const res = await postInternal(env.WEB_INTERNAL_URL, env.INTERNAL_HMAC_KEY, "/api/internal/verify/sweep", {});
      if (!res.ok) throw new Error(`sweep request rejected with HTTP ${res.status}`);
      const body = (await res.json()) as { enqueued: number };
      log("info", "verification sweep", body);
      return body;
    },
  };
}
