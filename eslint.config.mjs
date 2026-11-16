// Flat config. Module boundaries (PLAN §2.1) are enforced with eslint-plugin-boundaries.
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

const webFiles = ["apps/web/**/*.{ts,tsx}"];

export default [
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/.venv/**", "**/db/migrations/**", "**/next-env.d.ts", "playwright-report/**", "test-results/**"] },
  ...nextVitals.map((c) => ({ ...c, files: webFiles })),
  ...nextTs.map((c) => ({ ...c, files: c.files ?? ["**/*.{ts,tsx}"] })),
  { settings: { next: { rootDir: "apps/web" } } },
  {
    files: webFiles,
    plugins: { boundaries },
    settings: {
      "boundaries/root-path": new URL("./apps/web", import.meta.url).pathname,
      "boundaries/include": ["**/*.{ts,tsx}"],
      // Elements are folders; file categories separate a module's public service.ts from its internals.
      "boundaries/elements": [
        { type: "route", pattern: "app", partialMatch: false },
        { type: "module", pattern: "modules/*", partialMatch: false, capture: ["module"] },
        { type: "db", pattern: "db", partialMatch: false },
        { type: "component", pattern: "components", partialMatch: false },
        { type: "test", pattern: "tests", partialMatch: false },
      ],
      "boundaries/files": [
        { pattern: "modules/*/service.ts", category: "service" },
        { pattern: "modules/platform/route-manifest.ts", category: "manifest" },
      ],
      "import/resolver": { typescript: { project: "apps/web/tsconfig.json" } },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message: "{{ from.element.types.[0] }} may not import {{ to.element.types.[0] }} (PLAN §2.1 module boundaries)",
          policies: [
            // Pages and route handlers reach modules only through service.ts (+ UI components).
            { from: { element: { types: ["route", "component"] } }, allow: [
              { to: { element: { type: "module" }, file: { categories: "service" } } },
              { to: { element: { types: ["route", "component"] } } },
            ] },
            // Inside a module: anything in the same module; other modules only via their service.ts.
            { from: { element: { type: "module" } }, allow: [
              { to: { element: { type: "module", captured: { module: "{{ from.element.captured.module }}" } } } },
              { to: { element: { type: "module" }, file: { categories: "service" } } },
              { to: { element: { type: "db" } } },
            ] },
            { from: { element: { type: "db" } }, allow: { to: { element: { type: "db" } } } },
            // Tests may reach anything they test.
            { from: { element: { type: "test" } }, allow: { to: { element: { types: ["db", "module", "route", "test", "component"] } } } },
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  {
    // Reworded AT-27: only modules/auth may import the GitHub OAuth (single allowed POST) code.
    files: ["apps/web/**/*.{ts,tsx}"],
    ignores: ["apps/web/modules/auth/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["**/github-oauth", "**/github-oauth.ts"], message: "Only modules/auth may use the GitHub OAuth token exchange (AT-27)." }] }],
    },
  },
  {
    // db/client is the only DB entry point and is server-only; client components must never reach it.
    files: ["apps/web/components/**/*.tsx", "apps/web/app/**/client.tsx", "apps/web/app/**/*Button.tsx"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["**/db/**", "**/modules/**"], message: "Client components may not import server modules." }] }] },
  },
];
