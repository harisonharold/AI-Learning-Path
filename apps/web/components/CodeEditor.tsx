"use client";
import { useEffect, useRef, useState } from "react";

type MonacoEditor = { getValue(): string; dispose(): void; onDidChangeModelContent(cb: () => void): void };
type AmdRequire = ((deps: string[], cb: (m: { editor: { create(el: HTMLElement, o: object): MonacoEditor } }) => void, err?: () => void) => void) & { config(c: object): void };

/**
 * Monaco (self-hosted at /monaco/vs) as a progressive enhancement over a labelled <textarea>.
 * If Monaco cannot load, the textarea keeps working; keyboard users can always use it (E.5).
 */
export function CodeEditor({ initial, onChange, label }: { initial: string; onChange: (v: string) => void; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [value, setValue] = useState(initial);

  useEffect(() => {
    let editor: MonacoEditor | null = null;
    let cancelled = false;
    const start = () => {
      const req = (window as unknown as { require?: AmdRequire }).require;
      if (!req || cancelled) return;
      req.config({ paths: { vs: "/monaco/vs" } });
      req(["vs/editor/editor.main"], (monaco) => {
        if (cancelled || !host.current) return;
        const dark = document.documentElement.getAttribute("data-theme") === "dark" || (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
        editor = monaco.editor.create(host.current, { value, language: "python", theme: dark ? "vs-dark" : "vs", minimap: { enabled: false }, fontSize: 14, automaticLayout: true, ariaLabel: label, tabFocusMode: false, scrollBeyondLastLine: false });
        editor.onDidChangeModelContent(() => { const v = editor!.getValue(); setValue(v); onChange(v); });
        setEnhanced(true);
      }, () => {});
    };
    if ((window as unknown as { require?: AmdRequire }).require) start();
    else {
      const s = document.createElement("script");
      s.src = "/monaco/vs/loader.js";
      s.onload = start;
      document.head.appendChild(s);
    }
    return () => { cancelled = true; editor?.dispose(); };
    // Monaco is created once; later edits flow through onDidChangeModelContent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <p className="mb-1 text-xs text-[var(--ink-muted)]">{enhanced ? "Editor: in Monaco, press Ctrl+M (Cmd+Shift+M on macOS) to make Tab move focus out of the editor." : "Editor"}</p>
      <div ref={host} className={enhanced ? "h-80 rounded border border-[var(--border)]" : "hidden"} />
      {!enhanced && (
        <textarea aria-label={label} spellCheck={false} className="num h-80 w-full rounded border border-[var(--border)] bg-[var(--surface)] p-3 text-sm" value={value}
          onChange={(e) => { setValue(e.target.value); onChange(e.target.value); }} />
      )}
    </div>
  );
}
