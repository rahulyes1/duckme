/**
 * "Chai tax": many small payments that add up. Pure rules, unit tested in small.test.ts.
 */
import type { Card } from '../../lib/types';
import { addDays, fromISO, toISO } from '../../lib/format';
import { isLive } from './money-util';

/** A payment strictly under this many rupees counts as a small spend. */
export const SMALL_LIMIT = 200;

export const isSmall = (c: Card, limit = SMALL_LIMIT): boolean =>
  c.type === 'expense' && isLive(c) && (c.amount ?? 0) > 0 && (c.amount ?? 0) < limit;

export interface SmallCat { name: string; total: number; count: number }
export interface SmallSummary { count: number; total: number; top: SmallCat[] }

/** Small spends dated inside [from, to) (YYYY-MM-DD), with the top 3 categories by amount. */
export function smallInRange(cards: Card[], from: string, to: string, limit = SMALL_LIMIT): SmallSummary {
  const map = new Map<string, SmallCat>();
  let count = 0, total = 0;
  for (const c of cards) {
    if (!isSmall(c, limit) || !c.date || c.date < from || c.date >= to) continue;
    count++;
    total += c.amount!;
    const k = c.category || 'Other';
    const v = map.get(k) ?? { name: k, total: 0, count: 0 };
    v.total += c.amount!; v.count++;
    map.set(k, v);
  }
  const top = [...map.values()].sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name)).slice(0, 3);
  return { count, total: Math.round(total * 100) / 100, top };
}

/** Small spends in a month key ("YYYY-MM"). */
export function smallInMonth(cards: Card[], month: string, limit = SMALL_LIMIT): SmallSummary {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = toISO(new Date(y, m, 1));
  return smallInRange(cards, from, to, limit);
}

export interface SmallRepeat {
  title: string;
  amount: number;
  category: string;
  mode: string;
  count: number;
  lastDate: string;
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The small expenses you repeat most (same title and amount), from the last `days` days up to `ref`.
 * Needs at least 2 entries to count as a repeat. Split expenses are left out (they involve others).
 */
export function topRepeats(cards: Card[], ref: Date, n = 5, days = 90, limit = SMALL_LIMIT): SmallRepeat[] {
  const from = toISO(addDays(ref, -days));
  const to = toISO(addDays(ref, 1));
  const map = new Map<string, SmallRepeat>();
  for (const c of cards) {
    if (!isSmall(c, limit) || c.split || !c.date || c.date < from || c.date >= to) continue;
    const title = (c.title || c.category || 'Expense').trim();
    const key = `${norm(title)}|${c.amount}`;
    const r = map.get(key);
    if (!r) {
      map.set(key, { title, amount: c.amount!, category: c.category || 'Other', mode: c.mode || 'UPI', count: 1, lastDate: c.date });
    } else {
      r.count++;
      if (c.date > r.lastDate) { r.lastDate = c.date; r.title = title; r.category = c.category || r.category; r.mode = c.mode || r.mode; }
    }
  }
  return [...map.values()]
    .filter(r => r.count >= 2)
    .sort((a, b) => b.count - a.count || (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0) || a.title.localeCompare(b.title))
    .slice(0, n);
}

/** Same month a month earlier ("2026-01" → "2025-12"). */
export function prevMonthKey(month: string): string {
  const d = fromISO(`${month}-01`);
  return toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)).slice(0, 7);
}
