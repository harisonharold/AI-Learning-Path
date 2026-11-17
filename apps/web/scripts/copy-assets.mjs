// Copies self-hosted browser assets into public/ (git-ignored): Pyodide for the sandbox origin, Monaco for the app.
import { cpSync, existsSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkgDir = (name) => realpathSync(join(root, "node_modules", name));
const pyodide = pkgDir("pyodide");
const monaco = pkgDir("monaco-editor");

const pyOut = join(root, "public/sandbox/pyodide");
mkdirSync(pyOut, { recursive: true });
for (const f of ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]) cpSync(join(pyodide, f), join(pyOut, f));

const moOut = join(root, "public/monaco/vs");
if (!existsSync(join(moOut, "loader.js"))) cpSync(join(monaco, "min/vs"), moOut, { recursive: true });
console.log("copied pyodide and monaco assets");
