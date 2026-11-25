/** Timeline maths: dated events from cards, and buckets per zoom level. Pure. */
import type { Card } from '../../lib/types';
import { addDays, addMonths, addMonthsISO, fmtDate, nextSalary, toISO, today } from '../../lib/format';
import { isActive } from '../../lib/types';

export const LEVELS = ['Day', 'Week', 'Month', 'Year'] as const;
export type Level = 0 | 1 | 2 | 3;

export interface TEvent {
  key: string;
  card: Card;
  /** YYYY-MM-DD (overdue items are placed on today). */
  date: string;
  label: string;
  amount: number;
  /** Counts toward "₹X going out" (bills and SIP/RD instalments). */
  out: boolean;
  late: boolean;
}

export interface Bucket {
  key: string;
  start: string; // inclusive ISO
  end: string;   // exclusive ISO
  label: string;
  sub: string;
  today: boolean;
  /** Salary credit date inside this bucket, if any. */
  salary: string | null;
}

const STEP: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };

export function buildEvents(cards: Card[], ref: Date = today()): TEvent[] {
  const start = toISO(ref), end = toISO(addMonths(ref, 16));
  const out: TEvent[] = [];
  const push = (card: Card, date: string, label: string, amount: number, isOut: boolean, i: number, late = false) => {
    if ((date >= start || late) && date < end) out.push({ key: `${card.id}:${i}`, card, date: late ? start : date, label, amount, out: isOut, late });
  };

  for (const c of cards) {
    if (!isActive(c)) continue;
    const title = c.title || 'Untitled';

    if (c.type === 'expense') {
      if (c.date && c.date >= start) push(c, c.date, title, c.amount ?? 0, false, 0);
      continue;
    }
    if (c.type === 'invest') {
      const inv = c.invest;
      if (inv?.next) {
        const monthly = inv.kind === 'SIP' || inv.kind === 'RD' || c.repeat === 'monthly';
        if (!monthly) push(c, inv.next, title, c.amount ?? 0, true, 0);
        else for (let i = 0; i < 18; i++) {
          const d = addMonthsISO(inv.next, i);
          if (d >= end) break;
          push(c, d, title, c.amount ?? 0, true, i);
        }
      }
      if (inv?.maturity) push(c, inv.maturity, `${title} matures`, 0, false, 99);
      continue;
    }
    if ((c.type === 'bill' || c.type === 'task') && c.due) {
      const amt = c.amount ?? 0, isOut = c.type === 'bill';
      const step = STEP[c.repeat ?? 'none'] ?? 0;
      const late = c.due < start;
      if (late) push(c, c.due, title, amt, isOut, 0, true);
      if (!step) { if (!late) push(c, c.due, title, amt, isOut, 0); continue; }
      for (let i = late ? 1 : 0; i < 40; i++) {
        const d = addMonthsISO(c.due, step * i);
        if (d >= end) break;
        push(c, d, title, amt, isOut, i);
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(b.late) - Number(a.late)));
}

const MON = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short' });
const salaryIn = (y: number, m: number, day: number) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));

/** First salary credit date in [s, e), or null. */
function salaryBetween(s: Date, e: Date, day: number): string | null {
  for (let y = s.getFullYear(), m = s.getMonth(); new Date(y, m, 1) < e; m++) {
    const d = salaryIn(y, m, day);
    if (d >= s && d < e) return toISO(d);
  }
  return null;
}

export function buildBuckets(level: Level, salaryDay: number, ref: Date = today()): Bucket[] {
  const B: Bucket[] = [];
  const add = (s: Date, e: Date, label: string, sub: string, i: number, salary: string | null) =>
    B.push({ key: `${level}:${toISO(s)}`, start: toISO(s), end: toISO(e), label, sub, today: i === 0, salary });

  if (level === 0) {
    const sal = toISO(nextSalary(salaryDay, ref));
    for (let i = 0; i < 14; i++) {
      const s = addDays(ref, i);
      const label = i === 0 ? 'Today' : i === 1 ? 'Tmrw' : s.toLocaleDateString('en-IN', { weekday: 'short' });
      add(s, addDays(s, 1), label, fmtDate(toISO(s)), i, toISO(s) === sal ? sal : null);
    }
  } else if (level === 1) {
    const mon = addDays(ref, -((ref.getDay() + 6) % 7));
    for (let i = 0; i < 8; i++) {
      const s = addDays(mon, i * 7), e = addDays(s, 7), l = addDays(e, -1);
      add(s, e, `${s.getDate()}–${l.getDate()}`, MON(s) === MON(l) ? MON(s) : `${MON(s)}–${MON(l)}`, i, salaryBetween(s, e, salaryDay));
    }
  } else if (level === 2) {
    for (let i = 0; i < 7; i++) {
      const s = new Date(ref.getFullYear(), ref.getMonth() + i, 1), e = new Date(ref.getFullYear(), ref.getMonth() + i + 1, 1);
      add(s, e, MON(s), String(s.getFullYear()), i, salaryBetween(s, e, salaryDay));
    }
  } else {
    const q0 = Math.floor(ref.getMonth() / 3) * 3;
    for (let i = 0; i < 5; i++) {
      const s = new Date(ref.getFullYear(), q0 + i * 3, 1), e = new Date(ref.getFullYear(), q0 + i * 3 + 3, 1);
      add(s, e, `${MON(s)}–${MON(addDays(e, -1))}`, String(s.getFullYear()), i, null);
    }
  }
  return B;
}
