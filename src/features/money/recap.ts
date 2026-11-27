/**
 * Month-end recap: the salary cycle that just ended, compared with the one before it. Pure; tested in recap.test.ts.
 */
import type { Card } from '../../lib/types';
import { daysBetween, fromISO, toISO } from '../../lib/format';
import { salaryCycle } from './cashflow';
import { isSpend } from '../../lib/logic';

export interface RecapCat { name: string; amount: number; prev: number }
export interface Recap {
  /** The cycle being recapped: [start, end) — end is the salary day that closed it. */
  start: string;
  end: string;
  /** e.g. "November" — the month most of the cycle fell in. */
  label: string;
  spent: number;
  prevSpent: number;
  salary: number;
  /** salary − spent, when a salary is set. */
  kept: number | null;
  keptPct: number | null;
  count: number;
  top: RecapCat[];
  billsPaid: number;
  billsCount: number;
  noSpendDays: number;
  days: number;
  biggest: { title: string; amount: number; date: string } | null;
}

function cycleBounds(salaryDay: number, ref: Date, back: number): { start: string; end: string } {
  // The cycle containing ref is "this" one; back=1 is the one that just ended.
  const cur = salaryCycle(salaryDay, ref);
  let start = cur.start, end = cur.end;
  for (let i = 0; i < back; i++) {
    const prevRef = new Date(fromISO(start).getTime() - 86400000);
    const c = salaryCycle(salaryDay, prevRef);
    start = c.start; end = c.end;
  }
  return { start, end };
}

const inRange = (c: Card, s: string, e: string) => !!c.date && c.date >= s && c.date < e;

export function monthRecap(cards: Card[], salary: number, salaryDay: number, ref: Date): Recap {
  const { start, end } = cycleBounds(salaryDay, ref, 1);
  const prev = cycleBounds(salaryDay, ref, 2);
  const exp = cards.filter(c => isSpend(c) && (c.amount ?? 0) > 0);
  const now = exp.filter(c => inRange(c, start, end));
  const then = exp.filter(c => inRange(c, prev.start, prev.end));
  const sum = (l: Card[]) => l.reduce((s, c) => s + (c.amount ?? 0), 0);
  const byCat = (l: Card[]) => l.reduce<Record<string, number>>((a, c) => { const k = c.category ?? 'Other'; a[k] = (a[k] ?? 0) + (c.amount ?? 0); return a; }, {});

  const spent = sum(now), prevSpent = sum(then);
  const a = byCat(now), b = byCat(then);
  const top = Object.entries(a).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([name, amount]) => ({ name, amount, prev: b[name] ?? 0 }));
  // Card bill payments are transfers (cardPayment), never in `now`, so a card bill isn't counted on top of its spends.
  const bills = now.filter(c => c.category === 'Bills' && !c.cardPayment);
  const days = Math.max(1, daysBetween(fromISO(start), fromISO(end)));
  const spentDays = new Set(now.map(c => c.date));
  const biggestCard = now.reduce<Card | null>((m, c) => (!m || (c.amount ?? 0) > (m.amount ?? 0) ? c : m), null);
  const mid = new Date(fromISO(start).getTime() + (days / 2) * 86400000);

  return {
    start, end,
    label: mid.toLocaleDateString('en-IN', { month: 'long' }),
    spent, prevSpent, salary,
    kept: salary > 0 ? salary - spent : null,
    keptPct: salary > 0 ? Math.round(((salary - spent) / salary) * 100) : null,
    count: now.length,
    top,
    billsPaid: sum(bills),
    billsCount: bills.length,
    noSpendDays: days - spentDays.size,
    days,
    biggest: biggestCard ? { title: biggestCard.title || biggestCard.category || 'Spend', amount: biggestCard.amount ?? 0, date: biggestCard.date! } : null,
  };
}

/** "01-10 to 31-10": the cycle's first and last day (the day before the next salary). */
export const cycleLabel = (r: Recap) => {
  const last = toISO(new Date(fromISO(r.end).getTime() - 86400000));
  return `${r.start.slice(8, 10)}-${r.start.slice(5, 7)} to ${last.slice(8, 10)}-${last.slice(5, 7)}`;
};
