import { pageUser } from "@/modules/auth/service";
import { dueQuiz, today } from "@/modules/learning/service";
import { Workspace } from "./workspace";

export const metadata = { title: "Workspace" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const u = await pageUser();
  const [q, t] = await Promise.all([dueQuiz(u.id), today(u.id)]);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">Daily workspace</h1>
      <Workspace cards={q.cards.map((c) => ({ id: c.id, front: c.front, back: c.back }))} plan={t.plan.filter((p) => p.kind !== "quiz")} weekId={t.current?.riWeekIds[0] ?? "RI-W01"} />
    </div>
  );
}
