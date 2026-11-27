/**
 * Today's priorities for the top of Home. Pure: cards + a date in, a short ordered list out.
 * Groups, in this order, each in your own order (byRank): very very important → very important → important → Do now → bills due within 3 days
 * (overdue included) → planned for today or earlier / tasks due by today → tasks with a deadline tomorrow
 * (so a hard deadline never surprises you). Tested in priorities.test.ts.
 */
import type { Card } from '../../lib/types';
import { isActive } from '../../lib/types';
import { addDays, toISO } from '../../lib/format';
import { byRank } from '../../lib/logic';

export interface Priorities { items: Card[]; more: number }

const KINDS = new Set<Card['type']>(['task', 'bill', 'note']);

export function todayPriorities(cards: Card[], ref: Date, max = 5): Priorities {
  const t = toISO(ref);
  const soon = toISO(addDays(ref, 3));
  const tomorrow = toISO(addDays(ref, 1));
  const live = cards.filter(c => KINDS.has(c.type) && isActive(c) && !c.journalDate).sort(byRank);
  const billSoon = (c: Card) => c.type === 'bill' && !!c.due && c.due <= soon;
  // Your importance levels come first, highest first, with or without a date.
  const groups: ((c: Card) => boolean)[] = [
    c => c.level === 3,
    c => c.level === 2,
    c => c.level === 1,
    c => c.quadrant === 'do',
    billSoon,
    c => (c.when?.unit === 'day' && c.when.start <= t) || (c.type === 'task' && !!c.due && c.due <= t),
    c => c.type === 'task' && !!c.due && c.due <= tomorrow,
  ];
  const seen = new Set<string>();
  const all: Card[] = [];
  for (const inGroup of groups) {
    for (const c of live) {
      if (seen.has(c.id) || !inGroup(c)) continue;
      // "Later / drop" stays out of today, unless it is a bill about to cost you.
      if (c.quadrant === 'later' && !billSoon(c)) continue;
      // Planned (or postponed) to a later day: it waits for that day.
      if (c.type !== 'bill' && c.when?.unit === 'day' && c.when.start > t && !(c.due && c.due <= t)) continue;
      seen.add(c.id);
      all.push(c);
    }
  }
  const items = all.slice(0, Math.max(0, max));
  return { items, more: all.length - items.length };
}
