/** Weekly allowance (Mon–Sun): spent so far, what's left, and a fair per-day amount. Pure; tested in allowance.test.ts. */
import type { Card } from '../../lib/types';
import { toISO } from '../../lib/format';
import { isSpend } from '../../lib/logic';

export interface WeekAllowance { start: string; end: string; spent: number; left: number; perDay: number; daysLeft: number; frac: number; over: number }

export function weekAllowance(cards: Card[], allowance: number, ref: Date): WeekAllowance {
  const dow = (ref.getDay() + 6) % 7; // Monday = 0
  const mon = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - dow);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  const start = toISO(mon), end = toISO(sun);
  const spent = cards
    .filter(c => isSpend(c) && c.date && c.date >= start && c.date <= end && c.category !== 'Bills' && c.category !== 'Rent')
    .reduce((s, c) => s + (c.amount ?? 0), 0);
  const daysLeft = 7 - dow; // including today
  const left = Math.max(0, allowance - spent);
  return {
    start, end, spent, left, daysLeft,
    perDay: Math.floor(left / daysLeft),
    frac: allowance > 0 ? Math.min(1, spent / allowance) : 0,
    over: Math.max(0, spent - allowance),
  };
}
