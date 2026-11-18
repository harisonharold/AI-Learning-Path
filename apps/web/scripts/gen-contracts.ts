/** Writes packages/contracts/schemas/{benchmark,gate-result}.schema.json from the Zod contract (single source).
 * Run with `pnpm contracts:gen`; `tests/unit/contracts.test.ts` fails if the committed files drift. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { contractSchemas } from "../modules/research/internal/contract-schemas.ts";

const dir = join(import.meta.dirname, "../../../packages/contracts/schemas");
for (const [name, schema] of Object.entries(contractSchemas())) {
  writeFileSync(join(dir, `${name}.schema.json`), `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`wrote ${name}.schema.json`);
}
