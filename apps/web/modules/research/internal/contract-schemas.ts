import { z } from "zod";
import { BenchmarkUpload, GateResultUpload } from "./contract.ts";

/** JSON Schema (draft 2020-12) views of the upload contracts. Refinements that JSON Schema can't express
 * (finite numbers, cross-field rules, duplicate metric names) are enforced by the server and listed in `$comment`. */
export function contractSchemas(): Record<string, unknown> {
  const meta = (id: string, title: string, comment: string) => ({
    $id: `https://systems-atlas.local/schemas/${id}.schema.json`, title, $comment: comment,
  });
  return {
    benchmark: { ...meta("benchmark", "Benchmark run upload (FR-13); POST /api/projects/:id/runs, or /api/runner/results with kind=benchmark",
      "Generated from apps/web/modules/research/internal/contract.ts. Also enforced server-side: numbers finite; an ok run has >= 1 metric; a failed run has a failure_note; ended_at >= started_at; metric names unique; config_hash = sha256(canonical JSON of config); the server recomputes every summary from samples."),
      ...z.toJSONSchema(BenchmarkUpload, { io: "input", target: "draft-2020-12" }) },
    "gate-result": { ...meta("gate-result", "atlas-lab gate test result; POST /api/runner/results with kind=gate_tests",
      "Generated from apps/web/modules/research/internal/contract.ts. Also enforced server-side: bundle_sha256 equals the current bundle; the test names equal the bundle's test list."),
      ...z.toJSONSchema(GateResultUpload, { io: "input", target: "draft-2020-12" }) },
  };
}
