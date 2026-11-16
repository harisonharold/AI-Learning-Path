/** Proves the lint rules fire (a silent config would pass every other lint run). */
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const eslint = new ESLint({ cwd: root });
async function rules(file: string, code: string): Promise<string[]> {
  const [r] = await eslint.lintText(code, { filePath: `${root}apps/web/${file}` });
  return (r?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.ruleId ?? "parse");
}

describe("module boundaries (PLAN §2.1)", () => {
  it("route handler importing another module's internals is an error", async () =>
    expect(await rules("app/api/zz/route.ts", 'import { parseEnv } from "@/modules/platform/internal/env";\nexport const x = parseEnv;\n')).toContain("boundaries/dependencies"));
  it("route handler importing a module's service.ts is allowed", async () =>
    expect(await rules("app/api/zz/route.ts", 'import { getEnv } from "@/modules/platform/service";\nexport const x = getEnv;\n')).toEqual([]));
  it("module internal importing another module's internals is an error", async () =>
    expect(await rules("modules/github/internal/zz.ts", 'import { parseEnv } from "../../platform/internal/env.ts";\nexport const x = parseEnv;\n')).toContain("boundaries/dependencies"));
  it("module internal importing another module's service.ts is allowed", async () =>
    expect(await rules("modules/github/internal/zz.ts", 'import { getEnv } from "../../platform/service.ts";\nexport const x = getEnv;\n')).toEqual([]));
  it("route handler importing db directly is an error", async () =>
    expect(await rules("app/api/zz/route.ts", 'import { getDb } from "@/db/client";\nexport const x = getDb;\n')).toContain("boundaries/dependencies"));
});

describe("reworded AT-27: only modules/auth may import the GitHub OAuth token exchange", () => {
  it("a GitHub data module importing github-oauth is an error", async () =>
    expect(await rules("modules/github/internal/zz.ts", 'import { exchangeCode } from "../../auth/internal/github-oauth.ts";\nexport const x = exchangeCode;\n')).toContain("no-restricted-imports"));
  it("modules/auth may import it", async () =>
    expect(await rules("modules/auth/internal/zz.ts", 'import { exchangeCode } from "./github-oauth.ts";\nexport const x = exchangeCode;\n')).not.toContain("no-restricted-imports"));
});

describe("client components cannot import server modules", () => {
  it("components/* importing db is an error", async () =>
    expect(await rules("components/Zz.tsx", 'import { getDb } from "../db/client";\nexport const x = getDb;\n')).toContain("no-restricted-imports"));
});
