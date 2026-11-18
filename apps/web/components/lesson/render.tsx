import "server-only";
import { evaluate } from "@mdx-js/mdx";
import rehypeShiki from "@shikijs/rehype";
import * as runtime from "react/jsx-runtime";
import { Mermaid } from "./Mermaid";
import { RunPython } from "./RunPython";

/**
 * Renders trusted repo MDX only (lessons in content/). User-authored text is never compiled as MDX (PLAN D-10).
 * Before compiling: ```python run fences become <RunPython/>, ```mermaid fences become <Mermaid/>.
 */
export function preprocess(src: string): string {
  return src
    .replace(/```python run\n([\s\S]*?)```/g, (_m, code: string) => `<RunPython code={${JSON.stringify(code)}} />`)
    .replace(/```mermaid\n([\s\S]*?)```/g, (_m, chart: string) => `<Mermaid chart={${JSON.stringify(chart.trim())}} />`);
}

export function headings(src: string): { id: string; text: string }[] {
  return [...src.matchAll(/^## (.+)$/gm)].map((m) => ({ text: m[1]!.replace(/`/g, ""), id: slugify(m[1]!) }));
}
export const slugify = (s: string) => s.toLowerCase().replace(/`/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function LessonBody({ source, sandboxOrigin }: { source: string; sandboxOrigin: string }) {
  const { default: Content } = await evaluate(preprocess(source), {
    ...runtime,
    // Two GitHub-theme colours fall below 4.5:1 (axe, AT-13): light orange #e36209 and the comment grey #6a737d; swap them.
    rehypePlugins: [[rehypeShiki, { themes: { light: "github-light", dark: "github-dark" }, defaultColor: false,
      colorReplacements: { "github-light": { "#6a737d": "#57606a", "#e36209": "#b45000" }, "github-dark": { "#6a737d": "#9ea7b3" } } }]],
  });
  return (
    <Content
      components={{
        RunPython: (p: { code: string }) => <RunPython code={p.code} sandboxOrigin={sandboxOrigin} />,
        Mermaid,
        // Scrollable code blocks must be reachable by keyboard (axe: scrollable-region-focusable).
        pre: (p: React.ComponentProps<"pre">) => <pre {...p} tabIndex={0} />,
        h2: (p: { children?: React.ReactNode }) => <h2 id={slugify(String(Array.isArray(p.children) ? p.children.join("") : p.children ?? ""))} className="mt-10 mb-3 scroll-mt-20 text-2xl">{p.children}</h2>,
      }}
    />
  );
}
