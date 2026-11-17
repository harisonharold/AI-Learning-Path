"use client";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NAV } from "./nav.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";

const SHORTCUTS: [string, string][] = [
  ["Ctrl/⌘ K", "Command palette"], ["g t", "Go to Today"], ["g r", "Go to Roadmap"], ["g l", "Go to Lab"],
  ["/", "Search (opens palette)"], ["?", "This shortcut sheet"], ["j / k", "Next / previous item in lists"],
  ["1–4", "Card ratings in review"], ["Esc", "Close dialog"],
];

function isTyping(t: EventTarget | null) {
  return t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

export function Shell({ user, children }: { user: { name: string }; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);
  const [sheet, setSheet] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const pending = useRef<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); return; }
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?") { e.preventDefault(); setSheet(true); return; }
      if (e.key === "/") { e.preventDefault(); setPalette(true); return; }
      if (pending.current === "g") {
        pending.current = null;
        const target = NAV.find((n) => n.key === e.key);
        if (target) { e.preventDefault(); router.push(target.href); }
        return;
      }
      if (e.key === "g") { pending.current = "g"; setTimeout(() => (pending.current = null), 1200); return; }
      if (e.key === "j" || e.key === "k") {
        // j/k: next/previous item in the focused (or first) list marked data-keylist (E.2).
        const list = (document.activeElement?.closest("[data-keylist]") ?? document.querySelector("main [data-keylist]")) as HTMLElement | null;
        const items = list ? [...list.querySelectorAll<HTMLElement>("[data-keylist-item]")] : [];
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[e.key === "j" ? Math.min(i + 1, items.length - 1) : Math.max(i - 1, 0)]!.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="skip-link btn">Skip to content</a>
      <nav aria-label="Primary" className={`border-r border-[var(--border)] bg-[var(--surface)] p-3 ${collapsed ? "w-16" : "w-56"} shrink-0 transition-[width] duration-200 ease-out`}>
        <div className="mb-4 flex items-center justify-between gap-2">
          {!collapsed && <span className="font-serif text-lg font-semibold">Systems Atlas</span>}
          <button type="button" className="btn px-2" aria-expanded={!collapsed} aria-controls="rail-list" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} onClick={() => setCollapsed((c) => !c)}>
            <span aria-hidden="true">{collapsed ? "»" : "«"}</span>
          </button>
        </div>
        <ul id="rail-list" className="space-y-1">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? "page" : undefined} title={collapsed ? n.label : undefined}
                  className={`flex min-h-9 items-center rounded px-2 no-underline ${active ? "bg-[var(--surface-2)] font-semibold text-[var(--ink)]" : "text-[var(--ink)] hover:bg-[var(--surface-2)]"}`}>
                  {collapsed ? <span aria-hidden="true">{n.label[0]}</span> : n.label}
                  {collapsed && <span className="sr-only">{n.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-6 py-3">
          <button type="button" className="btn text-[var(--ink-muted)]" onClick={() => setPalette(true)}>
            Search or jump to… <kbd>Ctrl K</kbd>
          </button>
          <div className="flex items-center gap-3">
            <button type="button" className="btn" onClick={() => setSheet(true)} aria-label="Keyboard shortcuts">?</button>
            <ThemeToggle />
            <span className="text-sm text-[var(--ink-muted)]">{user.name}</span>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 px-6 py-8">{children}</main>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <Dialog.Root open={sheet} onOpenChange={setSheet}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40" />
          <Dialog.Content className="panel fixed left-1/2 top-24 w-[min(32rem,92vw)] -translate-x-1/2">
            <Dialog.Title className="font-serif text-xl">Keyboard shortcuts</Dialog.Title>
            <Dialog.Description className="mb-3 text-sm text-[var(--ink-muted)]">Shortcuts are ignored while typing in a field.</Dialog.Description>
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
              {SHORTCUTS.map(([k, d]) => (<div key={k} className="contents"><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>))}
            </dl>
            <Dialog.Close className="btn mt-4">Close</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const router = useRouter();
  const items = useMemo(() => NAV.filter((n) => n.label.toLowerCase().includes(q.toLowerCase())), [q]);
  function setOpen(o: boolean) { if (!o) { setQ(""); setIdx(0); } onOpenChange(o); }
  function go(href: string) { setOpen(false); router.push(href); }
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="panel fixed left-1/2 top-24 w-[min(36rem,92vw)] -translate-x-1/2 p-0" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <input autoFocus role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items[idx] ? `opt-${idx}` : undefined}
            aria-label="Search pages" placeholder="Go to page…" value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter" && items[idx]) { e.preventDefault(); go(items[idx].href); }
            }}
            className="w-full rounded-t border-b border-[var(--border)] bg-transparent px-4 py-3 outline-none" />
          <ul id="palette-list" role="listbox" aria-label="Pages" className="max-h-80 overflow-auto p-2">
            {items.map((n, i) => (
              <li key={n.href} id={`opt-${i}`} role="option" aria-selected={i === idx}
                onMouseEnter={() => setIdx(i)} onClick={() => go(n.href)}
                className={`flex min-h-9 cursor-pointer items-center justify-between rounded px-3 ${i === idx ? "bg-[var(--surface-2)]" : ""}`}>
                <span>{n.label}</span><span className="text-xs text-[var(--ink-muted)]">{n.phase === "P0" ? "" : `functional in ${n.phase}`}</span>
              </li>
            ))}
            {items.length === 0 && <li className="px-3 py-2 text-[var(--ink-muted)]">No matching page.</li>}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
