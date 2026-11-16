import "server-only";
import { Redis } from "ioredis";
import type { NonceStore } from "./hmac.ts";

let client: Redis | undefined;
export function getRedis(url = process.env.REDIS_URL): Redis {
  if (!client) {
    if (!url) throw new Error("REDIS_URL is required");
    client = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
    client.on("error", () => {}); // surfaced by callers; avoid unhandled event crashes
  }
  return client;
}

export function setRedisForTests(url: string): Redis {
  void client?.quit().catch(() => {});
  client = undefined;
  return getRedis(url);
}

/** SET NX EX — a reused nonce returns false; a Redis error throws (verifyRequest fails closed). */
export function redisNonceStore(r: Redis = getRedis()): NonceStore {
  return {
    async claim(nonce, ttl) {
      const res = await r.set(`hmac:nonce:${nonce}`, "1", "EX", ttl, "NX");
      return res === "OK";
    },
  };
}

export async function pingRedis(): Promise<boolean> {
  try {
    return (await getRedis().ping()) === "PONG";
  } catch {
    return false;
  }
}
