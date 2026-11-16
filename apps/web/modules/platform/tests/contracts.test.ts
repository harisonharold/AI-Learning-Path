import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

const root = new URL("../../../../../packages/contracts/", import.meta.url);
const read = (p: string) => JSON.parse(readFileSync(new URL(p, root), "utf8"));

describe.each(["job-message", "job-result"])("contract %s (TS side, Ajv)", (name) => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(read(`schemas/${name}.schema.json`));
  it.each(read(`fixtures/${name}.valid.json`) as unknown[])("accepts valid fixture %#", (doc) => expect(validate(doc), JSON.stringify(validate.errors)).toBe(true));
  it.each(read(`fixtures/${name}.invalid.json`) as unknown[])("rejects invalid fixture %#", (doc) => expect(validate(doc)).toBe(false));
});
