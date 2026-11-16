import type { Quiz } from "./content-schema.ts";

/** Server-side grading. The client only ever sees questions without answers (publicQuiz). */
export function publicQuiz(q: Quiz) {
  return { id: q.id, title: q.title, pass_pct: q.pass_pct, questions: q.questions.map(({ id, prompt, choices }) => ({ id, prompt, choices })) };
}

export function gradeQuiz(q: Quiz, answers: Record<string, number | null>) {
  let correct = 0;
  const perQuestion: Record<string, boolean> = {};
  for (const x of q.questions) {
    const ok = answers[x.id] === x.answer;
    perQuestion[x.id] = ok;
    if (ok) correct++;
  }
  const pct = Math.round((correct / q.questions.length) * 1000) / 10;
  return { correct, total: q.questions.length, pct, passed: pct >= q.pass_pct, perQuestion };
}
