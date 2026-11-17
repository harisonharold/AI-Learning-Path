import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from "ts-fsrs";

/** FSRS scheduling (ts-fsrs). Target retention 0.9 (G §6.1); fuzz off so schedules are reproducible and testable. */
const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false }));

export interface StoredCard extends Omit<Card, "due" | "last_review"> { due: string; last_review?: string }

export function newCardState(now: Date): StoredCard {
  return serialize(createEmptyCard(now));
}
export function serialize(c: Card): StoredCard {
  const { due, last_review, ...rest } = c;
  return { ...rest, due: due.toISOString(), ...(last_review ? { last_review: last_review.toISOString() } : {}) };
}
/** Rebuilds a ts-fsrs card. Only the fields ts-fsrs 6 knows are kept: cards stored under 5.x also carry `elapsed_days`. */
export function deserialize(s: StoredCard): Card {
  const { stability, difficulty, scheduled_days, learning_steps, reps, lapses, state } = s;
  return { stability, difficulty, scheduled_days, learning_steps, reps, lapses, state, due: new Date(s.due), ...(s.last_review ? { last_review: new Date(s.last_review) } : {}) };
}

const DAY_MS = 86_400_000;

export function review(state: StoredCard, rating: 1 | 2 | 3 | 4, now: Date) {
  const before = deserialize(state);
  const { card } = scheduler.next(before, now, rating as Grade);
  // ts-fsrs 6 no longer reports elapsed days in its log; whole days since the previous review (0 for a new card).
  const elapsedDays = before.last_review ? Math.max(0, Math.floor((now.getTime() - before.last_review.getTime()) / DAY_MS)) : 0;
  return { state: serialize(card), due: card.due, elapsedDays, scheduledDays: card.scheduled_days };
}

export const RATING_LABEL: Record<1 | 2 | 3 | 4, string> = { [Rating.Again]: "Again", [Rating.Hard]: "Hard", [Rating.Good]: "Good", [Rating.Easy]: "Easy" } as Record<1 | 2 | 3 | 4, string>;
export { State };
