"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Apache ECharts wrapper (D: "ECharts only"). Loaded lazily per page (R-10). Colours come from the design tokens and
 * update with the theme; every series also gets its own dash pattern, so colour is never the only cue (E.1).
 * The canvas is decorative for assistive tech: each chart sits next to a data table and a text summary.
 */
export interface Theme { ink: string; muted: string; border: string; surface: string; series: string[] }
export const DASHES = ["solid", "dashed", "dotted", [8, 3, 2, 3], [2, 2]] as const;

function readTheme(): Theme {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return { ink: v("--ink"), muted: v("--ink-muted"), border: v("--border"), surface: v("--surface"), series: ["--accent", "--self", "--ai", "--amber", "--danger"].map(v) };
}

type EChartsInstance = { setOption: (o: unknown, notMerge?: boolean) => void; resize: () => void; dispose: () => void };

let loader: Promise<{ init: (el: HTMLElement, theme?: null, opts?: { renderer: "canvas" }) => EChartsInstance }> | undefined;
function loadECharts() {
  loader ??= Promise.all([import("echarts/core"), import("echarts/charts"), import("echarts/components"), import("echarts/renderers")]).then(([core, charts, comps, renderers]) => {
    core.use([charts.LineChart, charts.BarChart, charts.BoxplotChart, comps.GridComponent, comps.TooltipComponent, comps.LegendComponent, comps.TitleComponent, renderers.CanvasRenderer]);
    return core as unknown as { init: (el: HTMLElement, theme?: null, opts?: { renderer: "canvas" }) => EChartsInstance };
  });
  return loader;
}

export function Chart({ build, label, height = 280 }: { build: (t: Theme) => Record<string, unknown>; label: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let chart: EChartsInstance | undefined;
    let disposed = false;
    const draw = () => {
      if (!chart) return;
      const t = readTheme();
      chart.setOption({
        backgroundColor: "transparent", animation: false, color: t.series,
        textStyle: { color: t.ink, fontFamily: "Inter, system-ui, sans-serif" },
        legend: { textStyle: { color: t.ink }, top: 0 },
        tooltip: { trigger: "axis", backgroundColor: t.surface, borderColor: t.border, textStyle: { color: t.ink } },
        grid: { left: 56, right: 16, top: 36, bottom: 40 },
        ...build(t),
      }, true);
    };
    loadECharts().then((echarts) => {
      if (disposed || !ref.current) return;
      chart = echarts.init(ref.current, null, { renderer: "canvas" });
      draw();
    }).catch(() => setFailed(true));
    const onResize = () => chart?.resize();
    window.addEventListener("resize", onResize);
    const obs = new MutationObserver(draw);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", draw);
    return () => { disposed = true; window.removeEventListener("resize", onResize); obs.disconnect(); mq.removeEventListener("change", draw); chart?.dispose(); };
  }, [build]);
  if (failed) return <p role="status" className="text-sm">The chart could not load; the table below has the same data.</p>;
  return <div ref={ref} aria-hidden="true" data-chart={label} style={{ height, width: "100%" }} />;
}

/** Axis styling shared by every chart, from the current theme. */
export function axis(t: Theme, name: string, extra: Record<string, unknown> = {}) {
  return {
    name, nameLocation: "middle", nameGap: 28, nameTextStyle: { color: t.ink },
    axisLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.ink }, splitLine: { lineStyle: { color: t.border, opacity: 0.3 } }, ...extra,
  };
}
