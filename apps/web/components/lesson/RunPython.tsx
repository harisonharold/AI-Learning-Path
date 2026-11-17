"use client";
import { useState } from "react";
import { SandboxFrame } from "../sandbox/SandboxFrame";
import { useSandbox, type SandboxResult } from "../sandbox/useSandbox";

/** A runnable snippet inside a lesson. Runs in the browser sandbox; output is for learning only. */
export function RunPython({ code, sandboxOrigin }: { code: string; sandboxOrigin: string }) {
  const sb = useSandbox(sandboxOrigin);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<SandboxResult | null>(null);
  return (
    <div className="my-6 rounded border border-[var(--border)]">
      <pre className="num overflow-x-auto bg-[var(--surface-2)] p-3 text-sm"><code>{code}</code></pre>
      <div className="flex items-center gap-3 p-2">
        <button type="button" className="btn" disabled={!sb.ready || busy} onClick={async () => { setBusy(true); setOut(await sb.run(code)); setBusy(false); }}>
          {busy ? "Running…" : sb.ready ? "Run in sandbox" : "Loading Python…"}
        </button>
        <span className="text-xs text-[var(--ink-muted)]">Runs on a separate origin with no access to your account.</span>
      </div>
      {out && (
        <pre role="status" className="num max-h-64 overflow-auto border-t border-[var(--border)] p-3 text-sm whitespace-pre-wrap">{out.stdout}{out.stderr ? `\n${out.stderr}` : ""}</pre>
      )}
      <SandboxFrame frameRef={sb.frameRef} src={sb.src} />
    </div>
  );
}
