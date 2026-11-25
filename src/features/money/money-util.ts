/** Pure helpers for the Money screen and entry editor. No writes here. */
import type { Card, InvestKind, Repeat } from '../../lib/types';
import { addDaysISO, addMonths, fmtDate, inr, toISO, today, todayISO } from '../../lib/format';
import { isActive } from '../../lib/types';

export const monthKey = (d: Date): string => toISO(d).slice(0, 7);
export const monthStart = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), 1);
export const shortMonth = (d: Date): string => d.toLocaleDateString('en-IN', { month: 'short' });
export const longMonth = (d: Date): string => d.toLocaleDateString('en-IN', { month: 'long' });

/** Cards that still count (not trashed or killed). */
export const isLive = (c: Card): boolean => c.status !== 'trashed' && c.status !== 'killed';

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export const expensesIn = (cards: Card[], key: string): Card[] =>
  cards.filter(c => c.type === 'expense' && isLive(c) && !!c.date && c.date.startsWith(key));

export const spentIn = (cards: Card[], key: string): number => sum(expensesIn(cards, key).map(c => c.amount ?? 0));

export const openBills = (cards: Card[]): Card[] =>
  cards.filter(c => c.type === 'bill' && isActive(c) && !!c.due)
    .sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : a.rank - b.rank));

export const YEAR_MULT: Record<Repeat, number> = { monthly: 12, quarterly: 4, yearly: 1, none: 1 };
export const REPEAT_LABEL: Record<Repeat, string> = { none: 'One-time', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };

/** SIP and RD amounts are monthly instalments; everything else is a lump sum. */
export const isMonthly = (k: InvestKind | undefined): boolean => k === 'SIP' || k === 'RD';
export const hasMaturity = (k: InvestKind | undefined): boolean => k === 'FD' || k === 'RD' || k === 'PPF';

/** Next 10th of the month on or after today (default SIP date). */
export const nextTenth = (): string => {
  const t = today();
  const d = t.getDate() <= 10 ? new Date(t.getFullYear(), t.getMonth(), 10) : new Date(t.getFullYear(), t.getMonth() + 1, 10);
  return toISO(d);
};

export const DEFAULTS = {
  expense: (): Partial<Card> & { type: 'expense' } => ({ type: 'expense', date: todayISO(), mode: 'UPI', category: 'Other' }),
  bill: (): Partial<Card> & { type: 'bill' } => ({ type: 'bill', due: addDaysISO(todayISO(), 7), repeat: 'none' }),
  invest: (): Partial<Card> & { type: 'invest' } => ({ type: 'invest', invest: { kind: 'SIP', next: nextTenth() } }),
};

/** Parses a typed amount: strips ₹, commas and spaces. Returns null when not a number. */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[₹,\s]/g, '');
  if (!s) return null;
  if (!/^\d*\.?\d*$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Indian digit grouping without the ₹ sign, keeps up to 2 decimals. */
export const fmtPlain = (n: number | undefined): string =>
  n === undefined || n === null ? '' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function paidMessage(bill: Card | undefined, nextDue: string | null): string {
  const what = bill?.title || 'Bill';
  const amt = bill?.amount ? ` ${inr(bill.amount)}` : '';
  return nextDue ? `${what} paid${amt}. Next bill due ${fmtDate(nextDue)}.` : `${what} paid${amt}.`;
}

/** Last six months ending at `end` (oldest first). */
export const lastMonths = (end: Date, n = 6): Date[] =>
  Array.from({ length: n }, (_, i) => addMonths(monthStart(end), i - (n - 1)));
