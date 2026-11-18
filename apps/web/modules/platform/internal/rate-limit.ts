import "server-only";
import { getRedis } from "./redis.ts";

/**
 * Fixed-window rate limit in Redis (THREAT T-A7) for uploads and other costly endpoints.
 * Fails closed: if Redis is unreachable the caller gets `unavailable` and should answer 503.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<"ok" | "limited" | "unavailable"> {
  try {
    const k = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    const n = await getRedis().incr(k);
    if (n === 1) await getRedis().expire(k, windowSeconds + 1);
    return n > max ? "limited" : "ok";
  } catch {
    return "unavailable";
  }
}
