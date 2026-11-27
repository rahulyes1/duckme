/**
 * The 2-minute money review: payday checklist window, the week in money, and the Sunday streak.
 * Pure rules, unit tested in review.test.ts.
 *
 * Weeks run Monday to Sunday and are named by their Sunday. Reviewing any day of a week counts
 * for that week's Sunday, so "4 Sundays in a row" means 4 weeks in a row, each reviewed once.
 * Skipping a whole week resets the streak.
 */
import type { Card } from '../../lib/types';
import { isActive } from '../../lib/types';
import { addDays, daysBetween, fromISO, toISO } from '../../lib/format';
import { salaryCycle } from './cashflow';
import { isSpend } from '../../lib/logic';
import { isSmall } from './small';

/* ---------- weeks ---------- */

export interface WeekRange {
  /** Monday (YYYY-MM-DD). */
  start: string;
  /** Sunday (YYYY-MM-DD), the last day of the week. */
  sunday: string;
  /** The Monday after (exclusive end). */
  end: string;
}

/** Monday-to-Sunday week that contains `ref`. */
export function weekRange(ref: Date): WeekRange {
  const back = (ref.getDay() + 6) % 7; // Mon → 0 … Sun → 6
  const mon = addDays(ref, -back);
  return { start: toISO(mon), sunday: toISO(addDays(mon, 6)), end: toISO(addDays(mon, 7)) };
}

/** The Sunday that names the week containing `iso`. */
export const weekKey = (iso: string): string => weekRange(fromISO(iso)).sunday;

export const isSunday = (d: Date): boolean => d.getDay() === 0;

/* ---------- streak ---------- */

/** Streak after reviewing on `todayISO`. Same week again = unchanged; the week right after = +1; otherwise 1. */
export function updateStreak(prev: number | undefined, lastISO: string | undefined, todayISO: string): { streak: number; already: boolean } {
  const cur = weekKey(todayISO);
  const p = Math.max(0, prev ?? 0);
  if (lastISO) {
    const last = weekKey(lastISO);
    if (last === cur) return { streak: Math.max(1, p), already: true };
    if (daysBetween(fromISO(last), fromISO(cur)) === 7) return { streak: p + 1, already: false };
  }
  return { streak: 1, already: false };
}

/** Streak to show today: still alive if the last review was this week or last week, else 0. */
export function liveStreak(prev: number | undefined, lastISO: string | undefined, todayISO: string): number {
  if (!lastISO || !prev) return 0;
  const gap = daysBetween(fromISO(weekKey(lastISO)), fromISO(weekKey(todayISO)));
  return gap === 0 || gap === 7 ? prev : 0;
}

export const reviewedThisWeek = (lastISO: string | undefined, todayISO: string): boolean =>
  !!lastISO && weekKey(lastISO) === weekKey(todayISO);

/* ---------- week in money ---------- */

export interface WeekSummary {
  range: WeekRange;
  spent: number;
  /** Safe-to-spend per day × 7 (0 when salary isn't set). */
  allowance: number;
  topCategory: { name: string; total: number } | null;
  /** Open bills due in the next 7 days (overdue included), earliest first. */
  billsDue: Card[];
  billsTotal: number;
  smallCount: number;
  smallTotal: number;
}

/** `leftNow`: money left this salary cycle. The 7-day allowance never exceeds it (plus what was already
 *  spent this week), so near payday it can't promise more than you actually have. */
export function weekSummary(cards: Card[], ref: Date, safePerDay: number, leftNow?: number): WeekSummary {
  const range = weekRange(ref);
  const soon = toISO(addDays(ref, 7));
  const cats = new Map<string, number>();
  let spent = 0, smallCount = 0, smallTotal = 0;
  const billsDue: Card[] = [];
  for (const c of cards) {
    if (isSpend(c) && c.date && c.date >= range.start && c.date < range.end) {
      const a = c.amount ?? 0;
      spent += a;
      const k = c.category || 'Other';
      cats.set(k, (cats.get(k) ?? 0) + a);
      if (isSmall(c)) { smallCount++; smallTotal += a; }
    } else if (c.type === 'bill' && isActive(c) && c.due && c.due < soon) {
      billsDue.push(c);
    }
  }
  billsDue.sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : a.rank - b.rank));
  let topCategory: WeekSummary['topCategory'] = null;
  for (const [name, total] of cats) if (!topCategory || total > topCategory.total) topCategory = { name, total };
  return {
    range, spent, allowance: capAllowance(Math.max(0, safePerDay) * 7, spent, leftNow), topCategory, billsDue,
    billsTotal: billsDue.reduce((s, b) => s + (b.amount ?? 0), 0), smallCount, smallTotal,
  };
}

const capAllowance = (a: number, spent: number, leftNow?: number): number =>
  leftNow === undefined ? a : Math.max(0, Math.min(a, Math.max(0, leftNow) + spent));

/* ---------- payday ---------- */

/** True on salary day and the `extra` days after it. */
export function inPaydayWindow(salaryDay: number, ref: Date, extra = 2): boolean {
  const start = fromISO(salaryCycle(salaryDay, ref).start);
  const d = daysBetween(start, ref);
  return d >= 0 && d <= extra;
}

/** What was left from the previous salary cycle: salary − expenses dated in it. Null when salary isn't set. */
export function lastCycleLeftover(cards: Card[], salary: number, salaryDay: number, ref: Date): number | null {
  if (!salary) return null;
  const cur = salaryCycle(salaryDay, ref);
  const prev = salaryCycle(salaryDay, addDays(fromISO(cur.start), -1));
  let spent = 0;
  for (const c of cards) {
    if (isSpend(c) && c.date && c.date >= prev.start && c.date < prev.end) spent += c.amount ?? 0;
  }
  return salary - spent;
}

export const PAYDAY_STEPS = ['bills', 'autopay', 'save', 'budgets'] as const;
export type PaydayStep = typeof PAYDAY_STEPS[number];

/** localStorage key for this salary cycle's payday ticks. */
export const paydayKey = (cycleStart: string): string => `hisaab.payday.${cycleStart.slice(0, 7)}`;

/** Parses stored ticks, ignoring anything unexpected. */
export function parseTicks(raw: string | null): PaydayStep[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? (v.filter(x => (PAYDAY_STEPS as readonly string[]).includes(x as string)) as PaydayStep[]) : [];
  } catch { return []; }
}
