/**
 * Small smart helpers for Home. Pure: cards + a date in, a short list or a number out.
 * Tested in helpers.test.ts.
 */
import type { Card } from '../../lib/types';
import { isActive } from '../../lib/types';
import { addDays, daysBetween, fromISO, toISO } from '../../lib/format';

export type AheadKind = 'bill' | 'expiry' | 'maturity';
export interface AheadItem { kind: AheadKind; card: Card; date: string; amount: number }

/**
 * The things you forget: yearly / quarterly / one-time bills, document and insurance expiries, and
 * FD / RD / PPF maturities in the next `days` days. Monthly bills are left out (you know those),
 * and so are bills due before salary (Home already lists them, from `from` = the next salary date).
 */
export function aheadItems(cards: Card[], ref: Date, salaryISO: string, days = 60): AheadItem[] {
  const t = toISO(ref);
  const to = toISO(addDays(ref, days));
  const out: AheadItem[] = [];
  for (const c of cards) {
    if (!isActive(c) || c.journalDate) continue;
    if (c.type === 'bill' && c.due && c.repeat !== 'monthly' && c.due >= salaryISO && c.due <= to) {
      out.push({ kind: 'bill', card: c, date: c.due, amount: c.amount ?? 0 });
    }
    if (c.expiry && c.expiry >= t && c.expiry <= to) {
      out.push({ kind: 'expiry', card: c, date: c.expiry, amount: 0 });
    }
    const mat = c.type === 'invest' ? c.invest?.maturity : undefined;
    if (mat && mat >= t && mat <= to) {
      out.push({ kind: 'maturity', card: c, date: mat, amount: c.invest?.value ?? c.invest?.invested ?? c.amount ?? 0 });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.card.rank - b.card.rank));
}

/** Salary credited in the last few days (day 0, 1 or 2 of the cycle): Home says so once a month. */
export function salaryJustLanded(cycleStart: string, ref: Date, within = 2): boolean {
  const d = daysBetween(fromISO(cycleStart), ref);
  return d >= 0 && d <= within;
}
