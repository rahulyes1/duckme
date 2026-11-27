/**
 * Pure rules from BUILD_SPEC, kept free of the database and the UI so they can be unit tested:
 * ranking, bill repeat, salary split, month totals, investment gain/loss.
 */
import type { Card, Repeat } from './types';
import { isActive } from './types';
import { addMonths, addMonthsISO, fromISO, nextSalary, toISO } from './format';
import { investKindFromText } from './capture';

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

const counts = (c: Pick<Card, 'type' | 'status'>) => c.type === 'expense' && c.status !== 'trashed' && c.status !== 'killed';
const looksInvested = (c: Pick<Card, 'category' | 'title'>) => c.category === 'Investment' || !!investKindFromText(c.title);

/**
 * A real spend: a live expense that is not money put into an investment (SIP, MF, FD, PPF…) and
 * not a credit-card bill payment (the card spends were already counted when you made them).
 */
export function isSpend(c: Pick<Card, 'type' | 'status' | 'category' | 'title'> & { cardPayment?: boolean }): boolean {
  return counts(c) && !c.cardPayment && !looksInvested(c);
}

/** A live expense line that pays off a credit-card bill. Cash leaves the account, but it is not a spend. */
export function isCardPayment(c: Pick<Card, 'type' | 'status'> & { cardPayment?: boolean }): boolean {
  return c.type === 'expense' && c.status !== 'trashed' && c.status !== 'killed' && !!c.cardPayment;
}

/** A credit-card bill: marked "last safe day" (card style), or titled like "Credit card" / "Card bill". */
export function isCardBill(c: Pick<Card, 'type' | 'title'> & { lastSafe?: boolean }): boolean {
  return c.type === 'bill' && (c.lastSafe === true || /credit ?card|card bill/i.test(c.title ?? ''));
}

/** A live expense line that records money invested (category Investment, or a title like "SIP 5000"). */
export function isInvestLog(c: Pick<Card, 'type' | 'status' | 'category' | 'title'> & { cardPayment?: boolean }): boolean {
  return counts(c) && !c.cardPayment && looksInvested(c);
}

/** Spend totals for one month ("YYYY-MM"), per category, biggest first. Trashed/killed expenses and investments don't count. */
export function monthTotalsByCategory(cards: Card[], month: string): { total: number; byCategory: [string, number][] } {
  const map = new Map<string, number>();
  let total = 0;
  for (const c of cards) {
    if (!isSpend(c) || !c.date || !c.date.startsWith(month)) continue;
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

/** The label every screen uses for the calendar-month spend total. */
export const SPENT_THIS_MONTH = 'Spent this month';

/**
 * THE one definition of "spent this month" (Home and Money both use it): real spends dated in the calendar month
 * of `ref`, up to today, card spends included, investments and card-bill payments never counted.
 */
export function monthSpend(cards: Card[], ref: Date): { total: number; count: number; today: number; todayCount: number; invested: number } {
  const t = toISO(ref), m = t.slice(0, 7);
  let total = 0, count = 0, today = 0, todayCount = 0, invested = 0;
  for (const c of cards) {
    if (!c.date || !c.date.startsWith(m) || c.date > t) continue;
    if (isSpend(c)) {
      total += c.amount ?? 0; count++;
      if (c.date === t) { today += c.amount ?? 0; todayCount++; }
    } else if (isInvestLog(c)) invested += c.amount ?? 0;
  }
  return { total, count, today, todayCount, invested };
}
