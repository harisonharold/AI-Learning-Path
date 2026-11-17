"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

/**
 * Talks to the practice runner on SANDBOX_ORIGIN through a hidden iframe (PLAN D-14).
 * Messages are accepted only from that exact origin and only from our iframe, and are Zod-validated (X-05, T-B5).
 */
const Result = z.object({
  type: z.literal("result"),
  id: z.string(),
  ok: z.boolean(),
  timedOut: z.boolean().optional(),
  stdout: z.string().max(200_000),
  stderr: z.string().max(200_000),
  tests: z.array(z.object({ name: z.string().max(200), passed: z.boolean(), message: z.string().max(2000) })).max(100),
});
export type SandboxResult = z.infer<typeof Result>;

export function useSandbox(sandboxOrigin: string) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const pending = useRef(new Map<string, (r: SandboxResult) => void>());
  const [ready, setReady] = useState(false);
  // Set on the element after mount: the server has no window, and a server-rendered src would carry an empty parent.
  useEffect(() => {
    if (frame.current) frame.current.src = `${sandboxOrigin}/sandbox/runner.html?parent=${encodeURIComponent(window.location.origin)}`;
  }, [sandboxOrigin]);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== sandboxOrigin || ev.source !== frame.current?.contentWindow) return;
      if (ev.data?.type === "ready") { setReady(true); return; }
      const r = Result.safeParse(ev.data);
      if (!r.success) return;
      pending.current.get(r.data.id)?.(r.data);
      pending.current.delete(r.data.id);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sandboxOrigin]);

  const run = useCallback((code: string, tests?: string, timeoutMs = 15000) =>
    new Promise<SandboxResult>((resolve) => {
      const id = crypto.randomUUID();
      pending.current.set(id, resolve);
      frame.current?.contentWindow?.postMessage({ type: "run", id, code, tests: tests ?? null, timeoutMs }, sandboxOrigin);
    }), [sandboxOrigin]);

  return { frameRef: frame, ready, run };
}
