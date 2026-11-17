"use client";
import { useState } from "react";

export function ApplyPlan({ mode, hoursPerWeek }: { mode: "RI" | "ACC"; hoursPerWeek: number }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" className="btn btn-primary" onClick={async () => {
        const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, hoursPerWeek }) });
        setMsg(r.ok ? `Plan saved: ${mode === "RI" ? "Research-Intensive" : "Accelerated"}, ${hoursPerWeek} h/week. You can change it in Settings.` : "Could not save the mode.");
      }}>Use this plan ({mode}, {hoursPerWeek} h/week)</button>
      {msg && <span role="status" className="text-sm">{msg}</span>}
    </div>
  );
}
