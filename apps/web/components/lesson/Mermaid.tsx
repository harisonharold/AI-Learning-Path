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
        m.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "neutral" });
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
