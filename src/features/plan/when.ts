/**
 * Pure date helpers for planning slots (When) and the 4-box board. No DB, no React, so they're unit tested.
 * Weeks start on Monday. Dates are local "YYYY-MM-DD".
 */
import type { When } from '../../lib/types';
import { addDays, fmtDayMonth, fromISO, toISO, today } from '../../lib/format';

export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_SHORT = MONTH_LONG.map(m => m.slice(0, 3));

/** Monday of the week that contains `d`. */
export function weekStart(d: Date): Date {
  const back = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
}
export const weekStartISO = (d: Date): string => toISO(weekStart(d));

export function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export const monthStartISO = (d: Date): string => toISO(monthStart(d));

/** [start, end) of a month containing `d`. */
export function monthRange(d: Date): { start: Date; end: Date } {
  return { start: monthStart(d), end: new Date(d.getFullYear(), d.getMonth() + 1, 1) };
}

/** [start, end) of a planning slot. */
export function whenRange(w: When): { start: Date; end: Date } {
  const s = fromISO(w.start);
  if (w.unit === 'day') return { start: s, end: addDays(s, 1) };
  if (w.unit === 'week') { const m = weekStart(s); return { start: m, end: addDays(m, 7) }; }
  return monthRange(s);
}

/** Normalises a slot so week starts on a Monday and month on the 1st. */
export function normalizeWhen(w: When): When {
  const s = fromISO(w.start);
  if (w.unit === 'week') return { unit: 'week', start: weekStartISO(s) };
  if (w.unit === 'month') return { unit: 'month', start: monthStartISO(s) };
  return { unit: 'day', start: toISO(s) };
}

const monthsApart = (a: Date, b: Date) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

/** "Today", "Tomorrow", "Wed 26-11" · "This week", "Next week", "Week of 08-12" · "This month", "Next month", "January 2027". */
export function whenLabel(w: When, ref: Date = today()): string {
  const s = fromISO(w.start);
  if (w.unit === 'day') {
    const diff = Math.round((s.getTime() - ref.getTime()) / 864e5);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return `${DOW_SHORT[s.getDay()]} ${fmtDayMonth(w.start)}`;
  }
  if (w.unit === 'week') {
    const m = weekStart(s), cur = weekStart(ref);
    const weeks = Math.round((m.getTime() - cur.getTime()) / (7 * 864e5));
    if (weeks === 0) return 'This week';
    if (weeks === 1) return 'Next week';
    return `Week of ${fmtDayMonth(toISO(m))}`;
  }
  const n = monthsApart(ref, s);
  if (n === 0) return 'This month';
  if (n === 1) return 'Next month';
  return `${MONTH_LONG[s.getMonth()]} ${s.getFullYear()}`;
}

export interface WeekOption { start: string; label: string; range: string }
/** The next `n` weeks from the week containing `ref`. */
export function weekOptions(ref: Date, n = 10): WeekOption[] {
  const first = weekStart(ref);
  return Array.from({ length: n }, (_, i) => {
    const m = addDays(first, i * 7);
    const start = toISO(m);
    return {
      start,
      label: i === 0 ? 'This week' : i === 1 ? 'Next week' : `In ${i} weeks`,
      range: `${fmtDayMonth(start)} – ${fmtDayMonth(toISO(addDays(m, 6)))}`,
    };
  });
}

export interface MonthOption { start: string; label: string }
/** `n` months starting from the month containing `ref`: "Nov 2026". */
export function monthOptions(ref: Date, n = 12): MonthOption[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(ref.getFullYear(), ref.getMonth() + i, 1);
    return { start: toISO(d), label: `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}` };
  });
}

/** 6×7 Monday-first calendar cells for the month containing `d`. */
export function calendarCells(d: Date): Date[] {
  const first = weekStart(monthStart(d));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** Saturday of this week (today if it is Saturday; next Saturday if today is Sunday). */
export function thisSaturday(ref: Date): Date {
  const add = (6 - ref.getDay() + 7) % 7;
  return addDays(ref, add);
}

export type Slot = 'week' | 'month' | 'next' | 'later';
export const SLOTS: { id: Slot; title: string }[] = [
  { id: 'week', title: 'This week' },
  { id: 'month', title: 'This month' },
  { id: 'next', title: 'Next week' },
  { id: 'later', title: 'Later' },
];

/**
 * Which Week & Month section a slot falls into. Overdue day/week slots stay in "This week" so they
 * are not forgotten; overdue months stay in "This month". Next week wins over this month.
 */
export function slotOf(w: When, ref: Date = today()): Slot {
  const { start, end } = whenRange(w);
  const ws = weekStart(ref), we = addDays(ws, 7), nwe = addDays(ws, 14);
  const { start: ms, end: me } = monthRange(ref);
  if (w.unit === 'month') return end <= ms || start.getTime() === ms.getTime() ? 'month' : 'later';
  if (start < we) return 'week';
  if (end <= nwe) return 'next';
  if (start < me) return 'month';
  return 'later';
}

/** The When a new item gets when added to a section. */
export function whenForSlot(slot: Slot, ref: Date = today()): When {
  const ws = weekStart(ref);
  if (slot === 'week') return { unit: 'week', start: toISO(ws) };
  if (slot === 'next') return { unit: 'week', start: toISO(addDays(ws, 7)) };
  if (slot === 'month') return { unit: 'month', start: monthStartISO(ref) };
  return { unit: 'month', start: toISO(new Date(ref.getFullYear(), ref.getMonth() + 1, 1)) };
}

/**
 * New ranks for a box in its new order without disturbing anyone else: the box's existing rank
 * numbers, sorted, are handed out again in the new order. Ranks are global, so this keeps every
 * other card where it was.
 */
export function reassignRanks(orderedIds: string[], rankOf: (id: string) => number): Map<string, number> {
  const ranks = orderedIds.map(rankOf).sort((a, b) => a - b);
  // Duplicate rank numbers would make the order ambiguous; nudge them apart by tiny steps.
  for (let i = 1; i < ranks.length; i++) if (ranks[i] <= ranks[i - 1]) ranks[i] = ranks[i - 1] + 1e-3;
  return new Map(orderedIds.map((id, i) => [id, ranks[i]]));
}
