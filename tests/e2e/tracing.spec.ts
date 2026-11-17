import { expect, test } from "@playwright/test";
import { signIn } from "../support/stack.ts";

test("NFR-9: one job produces one trace spanning web and worker-py in Jaeger", async ({ page }) => {
  await signIn(page);
  const r = await page.request.post("/api/jobs", { data: { kind: "diag.echo", input: { message: "trace" } }, headers: { origin: "http://localhost:3000" } });
  const { id } = await r.json();
  await expect.poll(async () => {
    const j = await (await fetch("http://localhost:16686/api/traces?service=worker-py&limit=50&lookback=1h")).json();
    const t = (j.data ?? []).find((t: { spans: { tags: { key: string; value: string }[] }[] }) => t.spans.some((s) => s.tags.some((g) => g.key === "atlas.job_id" && g.value === id)));
    return t ? [...new Set(Object.values(t.processes as Record<string, { serviceName: string }>).map((p) => p.serviceName))].sort().join(",") : "";
  }, { timeout: 60000, intervals: [2000] }).toBe("web,worker-py");
});
