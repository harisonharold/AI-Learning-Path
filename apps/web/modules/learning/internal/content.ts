import "server-only";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { createHash } from "node:crypto";
import { CourseGrader, Curriculum, Diagnostic, Exercise, GateBundle, Lesson, Quiz, Source, validateContent, type Content, type LoadedBundle } from "./content-schema.ts";

/** Same canonical JSON as research's contract and atlas-lab (sorted keys, no whitespace); the bundle hash must agree. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

/** sha256 over {manifest, files}: what atlas-lab verifies after download and reports back with its result. */
export function bundleSha(manifest: GateBundle, files: Record<string, string>): string {
  return createHash("sha256").update(canonical({ manifest, files })).digest("hex");
}

function loadBundles(dir: string): Map<string, LoadedBundle> {
  const root = join(dir, "gate-tests");
  let entries: string[] = [];
  try { entries = readdirSync(root); } catch { return new Map(); }
  return new Map(entries.map((d) => {
    const manifest = GateBundle.parse(parse(readFileSync(join(root, d, "bundle.yaml"), "utf8")));
    const fileContents = Object.fromEntries(manifest.files.map((f) => [f, readFileSync(join(root, d, f), "utf8")] as const));
    return [manifest.ref, { ...manifest, fileContents, sha256: bundleSha(manifest, fileContents) }] as const;
  }));
}

/** Repo content directory. In containers CONTENT_DIR points at the copied /app/content. */
export function contentDir(): string {
  // Content is copied into the image separately (Dockerfile), so it must not be traced into the server bundle.
  return process.env.CONTENT_DIR ?? join(/* turbopackIgnore: true */ process.cwd(), process.cwd().endsWith("apps/web") ? "../../content" : "content");
}

export function loadContent(dir = contentDir()): Content {
  const y = (p: string) => parse(readFileSync(join(dir, p), "utf8"));
  const curriculum = Curriculum.parse(y("curriculum.yaml"));
  const sources = z.array(Source).parse(y("sources.yaml"));
  const lessons = z.array(Lesson).parse(y("lessons.yaml"));
  const quizzes = new Map(readdirSync(join(dir, "quizzes")).map((f) => { const q = Quiz.parse(y(join("quizzes", f))); return [q.id, q] as const; }));
  const exercises = new Map(
    readdirSync(join(dir, "exercises")).map((d) => {
      const e = Exercise.parse(y(join("exercises", d, "exercise.yaml")));
      return [e.id, { ...e, practiceTests: readFileSync(join(dir, "exercises", d, "practice_tests.py"), "utf8") }] as const;
    }),
  );
  const diagnostic = Diagnostic.parse(y("diagnostic.yaml"));
  const lessonBodies = new Map(lessons.map((l) => [l.slug, readFileSync(join(dir, l.body), "utf8")] as const));
  let courseGraders: CourseGrader[] = [];
  try { courseGraders = z.array(CourseGrader).parse(y("course-graders.yaml")); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  const content: Content = { curriculum, sources, lessons, quizzes, exercises, diagnostic, lessonBodies, gateBundles: loadBundles(dir), courseGraders };
  const errs = validateContent(content);
  if (errs.length) throw new Error(`content invalid:\n${errs.join("\n")}`);
  return content;
}

let cached: Content | undefined;
export function getContent(): Content {
  cached ??= loadContent();
  return cached;
}

/** Server-only: the reference solution text (never sent before the gate passes; X-06). */
export function readSolution(exerciseId: string, dir = contentDir()): string {
  if (!/^[a-z0-9-]+$/.test(exerciseId)) throw new Error("bad exercise id");
  return readFileSync(join(dir, "exercises", exerciseId, "solution.py"), "utf8");
}
