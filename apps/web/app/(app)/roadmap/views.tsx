"use client";
import "@xyflow/react/dist/style.css";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { StateBadge } from "@/components/StateBadge";

type Week = { id: string; ordinal: number; title: string; state: string; lockedBy: string[]; gateIds: string[]; hardware: string[]; lesson: string | null };
type Props = { weeks: Week[]; edges: [string, string][]; gates: Record<string, { status: string; title: string; selfAssessed: boolean }>; estimate: { weeks: number; finish: string; formula: string; method: string } };
const VIEWS = ["graph", "timeline", "list"] as const;

const STATE_COLOR: Record<string, string> = { passed: "var(--verified)", available: "var(--self)", in_progress: "var(--self)", remediation: "var(--stale)", locked: "var(--border)" };
const href = (w: Week) => (w.lesson ? `/learn/${w.lesson}` : `/gates/${w.gateIds[0]}`);

export function RoadmapViews(p: Props) {
  const [view, setView] = useState<(typeof VIEWS)[number]>("graph");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Roadmap view" className="flex gap-2">
        {VIEWS.map((v) => (
          <button key={v} role="tab" type="button" aria-selected={view === v} aria-controls={`panel-${v}`} id={`tab-${v}`} className={`btn ${view === v ? "btn-primary" : ""}`} onClick={() => setView(v)}>
            {v[0]!.toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
        {view === "graph" ? <Graph {...p} /> : view === "timeline" ? <Timeline {...p} /> : <List {...p} />}
      </div>
      <p className="text-sm text-[var(--ink-muted)]">Estimated finish <span className="num">{p.estimate.finish}</span> ({p.estimate.method === "planning" ? "planning estimate" : "from your pace"}): {p.estimate.formula}</p>
    </div>
  );
}

function Graph({ weeks, edges }: Props) {
  const router = useRouter();
  const nodes: Node[] = useMemo(() => weeks.map((w, i) => ({
    id: w.id,
    position: { x: (i % 6) * 210, y: Math.floor(i / 6) * 120 },
    data: { label: `${w.ordinal}. ${w.title} — ${w.state.replace("_", " ")}` },
    ariaLabel: `Week ${w.ordinal}: ${w.title}, ${w.state.replace("_", " ")}. Press Enter to open.`,
    style: { border: `2px ${w.state === "locked" ? "dashed" : "solid"} ${STATE_COLOR[w.state] ?? "var(--border)"}`, background: "var(--surface)", color: "var(--ink)", width: 190, fontSize: 12 },
  })), [weeks]);
  const flowEdges: Edge[] = useMemo(() => edges.map(([a, b]) => ({ id: `${a}-${b}`, source: a, target: b, style: { stroke: "var(--ink-muted)" } })), [edges]);
  return (
    <div className="h-[560px] rounded border border-[var(--border)]">
      <p className="sr-only">Graph of weeks and their prerequisites. The List view has the same information as a table.</p>
      <ReactFlow nodes={nodes} edges={flowEdges} fitView nodesDraggable={false} nodesConnectable={false} nodesFocusable edgesFocusable={false} proOptions={{ hideAttribution: true }}
        onNodeClick={(_e, n) => { const w = weeks.find((x) => x.id === n.id)!; router.push(href(w)); }}
        onKeyDown={(e) => { const id = (e.target as HTMLElement).closest("[data-id]")?.getAttribute("data-id"); if (e.key === "Enter" && id) { const w = weeks.find((x) => x.id === id); if (w) router.push(href(w)); } }}>
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function Timeline({ weeks, estimate }: Props) {
  const per = Math.max(1, estimate.weeks / Math.max(weeks.length, 1));
  return (
    <div className="space-y-1" aria-label="Timeline: each bar is one curriculum week laid out on the estimated calendar">
      {weeks.map((w, i) => (
        <div key={w.id} className="grid grid-cols-[14rem_1fr] items-center gap-2 text-sm">
          <span className="truncate">{w.ordinal}. {w.title}</span>
          <div className="relative h-6 rounded bg-[var(--surface-2)]">
            <div className="absolute h-6 rounded" style={{ left: `${(i / weeks.length) * 100}%`, width: `${(1 / weeks.length) * 100}%`, background: STATE_COLOR[w.state] ?? "var(--border)" }} title={`${w.state}, about calendar weeks ${Math.round(i * per) + 1}-${Math.round((i + 1) * per)}`} />
            <span className="num absolute right-2 top-0.5 text-xs">~cal. wk {Math.round(i * per) + 1}–{Math.round((i + 1) * per)} · {w.state.replace("_", " ")}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function List({ weeks, gates }: Props) {
  return (
    <table className="w-full text-sm" data-keylist>
      <caption className="sr-only">Curriculum weeks with state, gates and what unlocks them</caption>
      <thead><tr className="text-left"><th scope="col">Week</th><th scope="col">State</th><th scope="col">Gates</th><th scope="col">Unlocks after</th></tr></thead>
      <tbody>
        {weeks.map((w) => (
          <tr key={w.id} className="border-t border-[var(--border)] align-top">
            <td className="py-2"><Link href={href(w)} data-keylist-item>{w.ordinal}. {w.title}</Link><div className="text-xs text-[var(--ink-muted)]">{w.hardware.join(", ")}</div></td>
            <td className="py-2"><StateBadge state={w.state} /></td>
            <td className="py-2">{w.gateIds.map((g) => <div key={g}><Link href={`/gates/${g}`}>{gates[g]?.title ?? g}</Link> <span className="text-xs">({(gates[g]?.status ?? "not_started").replace("_", " ")}{gates[g]?.selfAssessed ? ", self-assessed" : ""})</span></div>)}</td>
            <td className="py-2 text-xs">{w.lockedBy.length ? w.lockedBy.join("; ") : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
