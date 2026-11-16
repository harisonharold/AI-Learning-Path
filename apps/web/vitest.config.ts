import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const alias = { "@": r("./"), "server-only": r("./tests/support/server-only.ts"), "@atlas/ui": r("../../packages/ui/src/index.ts") };

export default defineConfig({
  test: {
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["modules/**/tests/**/*.test.ts", "tests/unit/**/*.test.ts"], environment: "node" } },
      {
        resolve: { alias },
        test: { name: "int", include: ["tests/int/**/*.test.ts"], environment: "node", globalSetup: ["tests/int/global-setup.ts"], testTimeout: 60_000, hookTimeout: 180_000, fileParallelism: false },
      },
    ],
  },
});
