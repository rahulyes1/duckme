/**
 * Pure rules from BUILD_SPEC, kept free of the database and the UI so they can be unit tested:
 * ranking, bill repeat, salary split, month totals, investment gain/loss.
 */
import type { Card, Repeat } from './types';
import { isActive } from './types';
import { addMonths, addMonthsISO, fromISO, nextSalary, toISO } from './format';

/* ---------- ranking: userRank is the ONLY order ---------- */

/** Lower rank = higher up. A new card goes above everything, so your existing order never shuffles. */
export function rankForNewCard(existing: Iterable<number>): number {
  let min = Infinity;
  for (const r of existing) if (Number.isFinite(r) && r < min) min = r;
  return min === Infinity ? 1 : min - 1;
}

/** Sorts by rank only. Ties fall back to the id so the order is stable across reloads. */
export function byRank(a: Pick<Card, 'rank' | 'id'>, b: Pick<Card, 'rank' | 'id'>): number {
  return a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Moves one id from `from` to `to` and returns the new order. */
export function moveId(ids: string[], from: number, to: number): string[] {
  const out = [...ids];
  const [m] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, m);
  return out;
}

/* ---------- bills ---------- */

/** Next due date for a repeating bill or task, or null for one-offs. */
export function nextDueDate(due: string, repeat: Repeat | undefined): string | null {
  if (repeat === 'monthly') return addMonthsISO(due, 1);
  if (repeat === 'quarterly') return addMonthsISO(due, 3);
  if (repeat === 'yearly') return addMonthsISO(due, 12);
  return null;
}

/* ---------- salary split ---------- */

export interface SalarySplit {
  salaryISO: string;
  before: number; beforeCount: number;
  after: number; afterCount: number;
}

/**
 * Bills due before the next salary credit (overdue included) vs. due in the month after it.
 * Only live (open or delayed) bills count. This never reorders anything — it is display only.
 */
export function salarySplit(cards: Card[], salaryDay: number, ref: Date): SalarySplit {
  const sal = nextSalary(salaryDay, ref);
  const end = addMonths(sal, 1);
  const out: SalarySplit = { salaryISO: toISO(sal), before: 0, beforeCount: 0, after: 0, afterCount: 0 };
  for (const c of cards) {
    if (c.type !== 'bill' || !c.due || !isActive(c)) continue;
    const d = fromISO(c.due);
    if (d < sal) { out.before += c.amount ?? 0; out.beforeCount++; }
    else if (d < end) { out.after += c.amount ?? 0; out.afterCount++; }
  }
  return out;
}

/* ---------- money totals ---------- */

/** Expense totals for one month ("YYYY-MM"), per category, biggest first. Trashed/killed expenses don't count. */
export function monthTotalsByCategory(cards: Card[], month: string): { total: number; byCategory: [string, number][] } {
  const map = new Map<string, number>();
  let total = 0;
  for (const c of cards) {
    if (c.type !== 'expense' || !c.date || !c.date.startsWith(month)) continue;
    if (c.status === 'trashed' || c.status === 'killed') continue;
    const a = c.amount ?? 0;
    total += a;
    const k = c.category || 'Other';
    map.set(k, (map.get(k) ?? 0) + a);
  }
  return { total, byCategory: [...map.entries()].sort((a, b) => b[1] - a[1]) };
}

/** Gain or loss from what you typed in. Values only — never advice. */
export function gainLoss(c: Pick<Card, 'type' | 'invest' | 'amount'>): { diff: number; pct: number } | null {
  if (c.type !== 'invest' || !c.invest) return null;
  const invested = c.invest.invested ?? (c.invest.kind === 'SIP' || c.invest.kind === 'RD' ? undefined : c.amount);
  const value = c.invest.value;
  if (!invested || value === undefined || value === null) return null;
  const diff = value - invested;
  return { diff, pct: (diff / invested) * 100 };
}

/** Net worth card: sum of current values (falls back to invested amount when no value is typed). */
export function netWorth(cards: Card[]): { value: number; invested: number } {
  let value = 0, invested = 0;
  for (const c of cards) {
    if (c.type !== 'invest' || !isActive(c) || !c.invest) continue;
    const inv = c.invest.invested ?? (c.invest.kind === 'SIP' || c.invest.kind === 'RD' ? 0 : c.amount ?? 0);
    invested += inv;
    value += c.invest.value ?? inv;
  }
  return { value, invested };
}
