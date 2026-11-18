import "server-only";
import { getEnv, log, signRequest } from "@/modules/platform/service";

/** HMAC-signed call to api-py. Returns null on any failure (down, timeout, 5xx) so callers can degrade (NFR-5, AT-47). */
export async function callApiPy<T>(path: string, payload: unknown, timeoutMs = 30_000): Promise<T | null> {
  const env = getEnv();
  const body = JSON.stringify(payload);
  try {
    const res = await fetch(new URL(path, env.API_PY_URL), {
      method: "POST", body, signal: AbortSignal.timeout(timeoutMs),
      headers: { "content-type": "application/json", ...signRequest(env.INTERNAL_HMAC_KEY, "POST", path, body) },
    });
    if (!res.ok) {
      log("warn", "api-py call failed", { path, status: res.status });
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    log("warn", "api-py unreachable", { path, error: e instanceof Error ? e.name : "error" });
    return null;
  }
}
