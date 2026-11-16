import "server-only";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { Curriculum, Diagnostic, Exercise, Lesson, Quiz, Source, validateContent, type Content } from "./content-schema.ts";

/** Repo content directory. In containers CONTENT_DIR points at the copied /app/content. */
export function contentDir(): string {
  return process.env.CONTENT_DIR ?? join(process.cwd(), process.cwd().endsWith("apps/web") ? "../../content" : "content");
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
  const content: Content = { curriculum, sources, lessons, quizzes, exercises, diagnostic, lessonBodies };
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
