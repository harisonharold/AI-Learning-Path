"use client";
import type { RefObject } from "react";

/** Hidden iframe on the sandbox origin. allow-same-origin grants only the sandbox's own origin (PLAN D-14). */
export function SandboxFrame({ frameRef }: { frameRef: RefObject<HTMLIFrameElement | null> }) {
  return <iframe ref={frameRef} title="Python practice sandbox (separate origin)" sandbox="allow-scripts allow-same-origin" className="hidden" tabIndex={-1} aria-hidden="true" data-testid="sandbox-frame" />;
}
