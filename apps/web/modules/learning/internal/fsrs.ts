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
export function deserialize(s: StoredCard): Card {
  const { due, last_review, ...rest } = s;
  return { ...rest, due: new Date(due), ...(last_review ? { last_review: new Date(last_review) } : {}) } as Card;
}

export function review(state: StoredCard, rating: 1 | 2 | 3 | 4, now: Date) {
  const { card, log } = scheduler.next(deserialize(state), now, rating as Grade);
  return { state: serialize(card), due: card.due, elapsedDays: log.elapsed_days, scheduledDays: card.scheduled_days };
}

export const RATING_LABEL: Record<1 | 2 | 3 | 4, string> = { [Rating.Again]: "Again", [Rating.Hard]: "Hard", [Rating.Good]: "Good", [Rating.Easy]: "Easy" } as Record<1 | 2 | 3 | 4, string>;
export { State };
