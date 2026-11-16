"use client";
import { useState } from "react";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];

function readSaved(): Theme {
  if (typeof window === "undefined") return "system";
  try { const t = localStorage.getItem("atlas-theme"); return t === "light" || t === "dark" ? t : "system"; } catch { return "system"; }
}

/** Per-viewer convenience only; storage access is wrapped because it can throw (private mode). */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readSaved);
  function next() {
    const t = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
    setTheme(t);
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    try { if (t === "system") localStorage.removeItem("atlas-theme"); else localStorage.setItem("atlas-theme", t); } catch {}
  }
  return <button type="button" className="btn" onClick={next} suppressHydrationWarning aria-label={`Theme: ${theme}. Change theme`}>Theme: {theme}</button>;
}
