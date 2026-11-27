/** Pure helpers for the Money screen and entry editor. No writes here. */
import type { Card, InvestKind, Repeat } from '../../lib/types';
import { addDaysISO, addMonths, fmtDate, inr, toISO, today, todayISO } from '../../lib/format';
import { isActive } from '../../lib/types';
import { isSpend } from '../../lib/logic';
import { parse } from '../../lib/parse';
import { EXPENSE_CATEGORIES } from '../../lib/types';

/** Category from a spend's note when none was picked: "chai" → Food, "uber" → Travel. Else Other. */
export function guessCategory(note: string): string {
  const c = note.trim() ? parse(note).category : 'Other';
  return (EXPENSE_CATEGORIES as readonly string[]).includes(c) ? c : 'Other';
}

/** What a new bill's name tells us: "LIC premium" repeats yearly, "Netflix" monthly and renews on its own. */
export interface BillGuess { repeat?: Repeat; category?: string; autorenew?: boolean; lastSafe?: boolean }
const BILL_RULES: [RegExp, BillGuess][] = [
  [/\b(netflix|hotstar|spotify|prime ?video|youtube ?premium|sonyliv|zee5|jiocinema|ott)\b/i, { repeat: 'monthly', category: 'Recharge & OTT', autorenew: true }],
  [/\b(insurance|premium|lic|policy|mediclaim)\b/i, { repeat: 'yearly', category: 'Insurance' }],
  [/\b(annual|yearly|every year|har saal|amc|domain|membership)\b/i, { repeat: 'yearly' }],
  [/\b(quarterly|every 3 months|teen mahine)\b/i, { repeat: 'quarterly' }],
  [/\b(emi|loan)\b/i, { repeat: 'monthly', category: 'EMI' }],
  [/\b(rent|kiraya|maintenance)\b/i, { repeat: 'monthly', category: 'Rent' }],
  [/\b(bijli|electricity|wifi|broadband|postpaid|gas|water|paani|dth)\b/i, { repeat: 'monthly', category: 'Bills' }],
  [/\b(credit ?card|cc bill)\b/i, { repeat: 'monthly', category: 'Bills', lastSafe: true }],
  [/\b(recharge)\b/i, { category: 'Recharge & OTT' }],
  [/\b(school|tuition|fees?)\b/i, { category: 'Education' }],
];
export function billGuess(title: string): BillGuess {
  for (const [re, g] of BILL_RULES) if (re.test(title)) return g;
  return {};
}

export const monthKey = (d: Date): string => toISO(d).slice(0, 7);
export const monthStart = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), 1);
export const shortMonth = (d: Date): string => d.toLocaleDateString('en-IN', { month: 'short' });
export const longMonth = (d: Date): string => d.toLocaleDateString('en-IN', { month: 'long' });

/** Cards that still count (not trashed or killed). */
export const isLive = (c: Card): boolean => c.status !== 'trashed' && c.status !== 'killed';

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export const expensesIn = (cards: Card[], key: string): Card[] =>
  cards.filter(c => isSpend(c) && !!c.date && c.date.startsWith(key));

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

const AMOUNT_SCALE: Record<string, number> = { k: 1e3, l: 1e5, lac: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7 };

/** Parses a typed amount: strips ₹/Rs, commas and spaces. Understands "40k", "1.5 lakh", "2cr".
 *  Returns null when not a number. */
export function parseAmount(raw: string): number | null {
  let s = raw.toLowerCase().replace(/[₹,\s]/g, '').replace(/^rs\.?/, '');
  if (!s) return null;
  const m = s.match(/^(\d*\.?\d*)(k|l|lac|lakh|lakhs|cr|crore)$/);
  const mult = m && m[1] && m[1] !== '.' ? AMOUNT_SCALE[m[2]] : 1;
  if (m && mult !== 1) s = m[1];
  if (!/^\d*\.?\d*$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * mult * 100) / 100 : null;
}

/** Indian digit grouping without the ₹ sign, keeps up to 2 decimals. */
export const fmtPlain = (n: number | undefined): string =>
  n === undefined || n === null ? '' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function paidMessage(bill: Card | undefined, nextDue: string | null, expense?: Card): string {
  const what = bill?.title || 'Bill';
  const paid = expense?.amount ?? bill?.amount;
  const amt = paid ? ` ${inr(paid)}` : '';
  const card = expense?.cardPayment ? ' Card bill, not a new spend.' : '';
  return nextDue ? `${what} paid${amt}.${card} Next bill due ${fmtDate(nextDue)}.` : `${what} paid${amt}.${card}`;
}

/** Last six months ending at `end` (oldest first). */
export const lastMonths = (end: Date, n = 6): Date[] =>
  Array.from({ length: n }, (_, i) => addMonths(monthStart(end), i - (n - 1)));
