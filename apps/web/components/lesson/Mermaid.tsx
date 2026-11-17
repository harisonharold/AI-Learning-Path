"use client";
import { useEffect, useId, useState } from "react";

/** Static diagram from repo content. The source text stays available as the accessible alternative (E.5). */
export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    import("mermaid")
      .then(async ({ default: m }) => {
        const dark = document.documentElement.getAttribute("data-theme") === "dark" || (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
        // Explicit colours from our tokens: Mermaid's own dark theme fails WCAG contrast on edge labels.
        const v = dark
          ? { darkMode: true, background: "#1c1f23", primaryColor: "#262a2f", primaryTextColor: "#e8e6df", primaryBorderColor: "#6f747b", lineColor: "#a9a69c", textColor: "#e8e6df", edgeLabelBackground: "#262a2f", tertiaryColor: "#1c1f23" }
          : { background: "#fffdf7", primaryColor: "#ede8dc", primaryTextColor: "#1b1a17", primaryBorderColor: "#7d7869", lineColor: "#55524a", textColor: "#1b1a17", edgeLabelBackground: "#ede8dc", tertiaryColor: "#fffdf7" };
        m.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: v });
        const r = await m.render(`m${id}`, chart);
        if (alive) setSvg(r.svg);
      })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [chart, id]);
  return (
    <figure className="my-6">
      {svg && !failed ? <div role="img" aria-label="Diagram; text version below" className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} /> : null}
      <details className="mt-2 text-sm" open={failed || undefined}>
        <summary>Diagram as text</summary>
        <pre className="num whitespace-pre-wrap">{chart}</pre>
      </details>
    </figure>
  );
}
