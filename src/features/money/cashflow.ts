/**
 * Pure money rules for the Money tab: salary cycle, left-to-spend, safe-to-spend, budget status,
 * calendar buckets and the quick-entry number pad. No database, no UI — unit tested in cashflow.test.ts.
 */
import { evalExpr } from '../notes/calc';
import type { Card } from '../../lib/types';
import { EXPENSE_CATEGORIES, isActive } from '../../lib/types';
import { addMonths, daysBetween, fromISO, toISO } from '../../lib/format';
import { isMonthly } from './money-util';
import { isCardPayment, isInvestLog, isSpend } from '../../lib/logic';

/* ---------- salary cycle ---------- */

/** Salary credit date in a month, clamped to the month's last day (31 → 28/29/30). Month may overflow. */
export function salaryDate(year: number, month: number, salaryDay: number): Date {
  const day = Math.max(1, Math.min(31, Math.round(salaryDay || 1)));
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

export interface Cycle {
  /** Last salary credit on or before `ref` (YYYY-MM-DD). */
  start: string;
  /** Next salary credit after `ref` (YYYY-MM-DD). Not part of this cycle. */
  end: string;
  /** Days you have to live on what's left: today up to the day before salary. At least 1. */
  daysLeft: number;
  totalDays: number;
}

/** The salary cycle that contains `ref` (a local midnight date). Salary day itself starts a new cycle. */
export function salaryCycle(salaryDay: number, ref: Date): Cycle {
  const y = ref.getFullYear(), m = ref.getMonth();
  const thisMonth = salaryDate(y, m, salaryDay);
  const start = thisMonth <= ref ? thisMonth : salaryDate(y, m - 1, salaryDay);
  const end = thisMonth <= ref ? salaryDate(y, m + 1, salaryDay) : thisMonth;
  return {
    start: toISO(start),
    end: toISO(end),
    daysLeft: Math.max(1, daysBetween(ref, end)),
    totalDays: Math.max(1, daysBetween(start, end)),
  };
}

/* ---------- cash flow ---------- */

export interface CycleItem { card: Card; amount: number; date: string }

export interface CashFlow {
  cycle: Cycle;
  salary: number;
  bills: CycleItem[];
  billsTotal: number;
  sips: CycleItem[];
  sipsTotal: number;
  /** Real spends this cycle paid from your account (UPI, cash, net banking…). Card spends are in `onCard`. */
  spent: number;
  /** Spends made on a credit card this cycle. They reach your cash through the card bill, so `left` doesn't take them off. */
  onCard: number;
  /** Credit-card bills already paid this cycle (transfers to the card, not spends). Cash has left. */
  cardPaid: number;
  /** Money put into investments this cycle (logged SIP / MF / FD lines). Not a spend, but it has left your account. */
  invested: number;
  /** salary − bills − instalments − spent − invested − card bills paid. Negative when you are over. */
  left: number;
  /** left ÷ days until salary, never negative. */
  safeToday: number;
  /** How much you are over (0 when not over). */
  overBy: number;
}

const byDate = (a: CycleItem, b: CycleItem) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

const linked = (a: Card, b: Card) => a.links.includes(b.id) || b.links.includes(a.id);

/**
 * SIP/RD cards whose instalment in [start, end) is already paid by an investment log in the same
 * window: a log linked to the card, or a category 'Investment' line for the same amount.
 * Each log covers one instalment, so nothing is taken off twice.
 */
export function coveredInstalments(cards: Card[], start: string, end: string): Set<string> {
  const logs = cards.filter(c => isInvestLog(c) && !!c.date && c.date >= start && c.date < end);
  const due = cards.filter(c => c.type === 'invest' && isActive(c) && isMonthly(c.invest?.kind) && !!c.invest?.next && c.invest.next < end);
  const used = new Set<string>();
  const out = new Set<string>();
  const take = (match: (l: Card, c: Card) => boolean) => {
    for (const c of due) {
      if (out.has(c.id)) continue;
      const l = logs.find(x => !used.has(x.id) && match(x, c));
      if (l) { used.add(l.id); out.add(c.id); }
    }
  };
  take(linked);
  take((l, c) => l.category === 'Investment' && (l.amount ?? 0) > 0 && l.amount === c.amount);
  return out;
}

/**
 * Salary cash flow for the cycle that contains `ref`:
 * - bills: live bills due before the next salary (overdue ones included, they still need paying)
 * - sips: live SIP/RD instalments whose next date falls before the next salary
 * - spent: real spends dated inside the cycle, not on a card (paid bills become expenses, so nothing counts twice)
 * - onCard: spends on a credit card — shown, but cash only drops when the card bill is due / paid
 * - cardPaid: card bill payments this cycle (transfers, never spends)
 * - invested: investment lines dated inside the cycle; a SIP they already cover is not counted again
 */
export function cashFlow(cards: Card[], salary: number, salaryDay: number, ref: Date): CashFlow {
  const cycle = salaryCycle(salaryDay, ref);
  const bills: CycleItem[] = [];
  const sips: CycleItem[] = [];
  let spent = 0, onCard = 0, cardPaid = 0, invested = 0;
  const covered = coveredInstalments(cards, cycle.start, cycle.end);
  for (const c of cards) {
    if (c.type === 'bill' && isActive(c) && c.due && c.due < cycle.end) {
      bills.push({ card: c, amount: c.amount ?? 0, date: c.due });
    } else if (c.type === 'invest' && isActive(c) && isMonthly(c.invest?.kind) && c.invest?.next && c.invest.next < cycle.end) {
      if (!covered.has(c.id)) sips.push({ card: c, amount: c.amount ?? 0, date: c.invest.next });
    } else if (c.type === 'expense' && c.date && c.date >= cycle.start && c.date < cycle.end) {
      if (isSpend(c)) { if (c.mode === 'Card') onCard += c.amount ?? 0; else spent += c.amount ?? 0; }
      else if (isCardPayment(c)) cardPaid += c.amount ?? 0;
      else if (isInvestLog(c)) invested += c.amount ?? 0;
    }
  }
  bills.sort(byDate); sips.sort(byDate);
  const billsTotal = bills.reduce((s, b) => s + b.amount, 0);
  const sipsTotal = sips.reduce((s, b) => s + b.amount, 0);
  const left = salary - billsTotal - sipsTotal - spent - invested - cardPaid;
  const safe = safeToSpend(left, cycle.daysLeft);
  return { cycle, salary, bills, billsTotal, sips, sipsTotal, spent, onCard, cardPaid, invested, left, safeToday: safe.perDay, overBy: safe.overBy };
}

/** Per-day amount you can spend until salary. Never negative; `overBy` says how far over you are. */
export function safeToSpend(left: number, daysLeft: number): { perDay: number; overBy: number } {
  if (left <= 0) return { perDay: 0, overBy: left < 0 ? -left : 0 };
  return { perDay: Math.floor(left / Math.max(1, daysLeft)), overBy: 0 };
}

/* ---------- paid this cycle ---------- */

export interface PaidBill { bill: Card; expense: Card | null; paidOn: string; amount: number }

/**
 * Bills marked paid inside the salary cycle that contains `ref`, newest first, each with the expense
 * that paying it created (linked bill → expense) and its amount. Pure.
 */
export function paidThisCycle(cards: Card[], salaryDay: number, ref: Date): PaidBill[] {
  const cyc = salaryCycle(salaryDay, ref);
  const byId = new Map(cards.map(c => [c.id, c]));
  const out: PaidBill[] = [];
  for (const b of cards) {
    if (b.type !== 'bill' || b.status !== 'done' || !b.doneAt) continue;
    const paidOn = toISO(new Date(b.doneAt));
    if (paidOn < cyc.start || paidOn >= cyc.end) continue;
    const expense = b.links.map(id => byId.get(id)).find(x => !!x && x.type === 'expense' && x.status !== 'trashed' && x.status !== 'killed' && x.links.includes(b.id)) ?? null;
    out.push({ bill: b, expense, paidOn: expense?.date ?? paidOn, amount: expense?.amount ?? b.amount ?? 0 });
  }
  return out.sort((a, b) => (b.bill.doneAt ?? 0) - (a.bill.doneAt ?? 0));
}

/* ---------- budgets ---------- */

export type BudgetLevel = 'none' | 'ok' | 'warn' | 'over';
export interface BudgetStatus { level: BudgetLevel; frac: number; pct: number; left: number; over: number }

/** ok below 80%, warn from 80% up to the budget, over once spending is above the budget. */
export function budgetStatus(spent: number, budget: number | undefined): BudgetStatus {
  if (!budget || budget <= 0) return { level: 'none', frac: 0, pct: 0, left: 0, over: 0 };
  const frac = spent / budget;
  const level: BudgetLevel = spent > budget ? 'over' : frac >= 0.8 ? 'warn' : 'ok';
  return { level, frac, pct: Math.round(frac * 100), left: Math.max(0, budget - spent), over: Math.max(0, spent - budget) };
}

/** Which threshold a new expense just crossed (for the warning toast), or null. */
export function budgetCrossing(before: number, after: number, budget: number | undefined): 'warn' | 'over' | null {
  if (!budget || budget <= 0 || after <= before) return null;
  if (before <= budget && after > budget) return 'over';
  if (before < budget * 0.8 && after >= budget * 0.8) return 'warn';
  return null;
}

/** Spending per category for a month key ("YYYY-MM"). */
export function spentByCategory(cards: Card[], month: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cards) {
    if (!isSpend(c) || !c.date?.startsWith(month)) continue;
    const k = c.category || 'Other';
    out[k] = (out[k] ?? 0) + (c.amount ?? 0);
  }
  return out;
}

/* ---------- quick entry categories ---------- */

/** Categories used this month, most used first (by count, then by amount). */
export function usedCategories(cards: Card[], month: string): string[] {
  const n = new Map<string, { count: number; amt: number }>();
  for (const c of cards) {
    if (!isSpend(c) || !c.date?.startsWith(month)) continue;
    const k = c.category || 'Other';
    const v = n.get(k) ?? { count: 0, amt: 0 };
    v.count++; v.amt += c.amount ?? 0;
    n.set(k, v);
  }
  return [...n.entries()].sort((a, b) => b[1].count - a[1].count || b[1].amt - a[1].amt).map(e => e[0]);
}

/** Full category order for quick entry: favourites, then most used this month, then the rest. */
export function quickCategories(favs: string[] | undefined, used: string[]): string[] {
  const all = EXPENSE_CATEGORIES as readonly string[];
  const out: string[] = [];
  for (const k of [...(favs ?? []), ...used, ...all]) if (all.includes(k) && !out.includes(k)) out.push(k);
  return out;
}

/** Adds or removes a favourite category. */
export function toggleFav(favs: string[] | undefined, cat: string): string[] {
  const f = favs ?? [];
  return f.includes(cat) ? f.filter(x => x !== cat) : [...f, cat];
}

/* ---------- calendar ---------- */

export interface CalCell { iso: string; day: number; inMonth: boolean }

/** Monday-first month grid in whole weeks. `month` is any date in the month. */
export function monthGrid(month: Date): CalCell[] {
  const y = month.getFullYear(), m = month.getMonth();
  const first = new Date(y, m, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const total = Math.ceil((offset + days) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(y, m, 1 - offset + i);
    return { iso: toISO(d), day: d.getDate(), inMonth: d.getMonth() === m };
  });
}

export type DueKind = 'bill' | 'sip' | 'maturity';
export interface DueItem {
  kind: DueKind;
  card: Card;
  date: string;
  amount: number;
  /** A future repeat of a bill or SIP (not its own card yet). Can't be marked paid. */
  projected: boolean;
}

const STEP: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** Repeats of a date every `step` months, from the original date (no day drift), inside [from, to). */
function occurrences(first: string, step: number, from: string, to: string): string[] {
  const out: string[] = [];
  const base = fromISO(first);
  for (let k = 0; k < 600; k++) {
    const d = toISO(addMonths(base, k * step));
    if (d >= to) break;
    if (d >= from) out.push(d);
    if (!step) break;
  }
  return out;
}

/** Bills, SIP/RD instalments and maturities that fall in [from, to), repeats projected forward. */
export function dueItemsInRange(cards: Card[], from: string, to: string): DueItem[] {
  const out: DueItem[] = [];
  for (const c of cards) {
    if (!isActive(c)) continue;
    if (c.type === 'bill' && c.due) {
      for (const d of occurrences(c.due, STEP[c.repeat ?? 'none'] ?? 0, from, to)) {
        out.push({ kind: 'bill', card: c, date: d, amount: c.amount ?? 0, projected: d !== c.due });
      }
    } else if (c.type === 'invest' && c.invest) {
      if (isMonthly(c.invest.kind) && c.invest.next) {
        for (const d of occurrences(c.invest.next, 1, from, to)) {
          out.push({ kind: 'sip', card: c, date: d, amount: c.amount ?? 0, projected: d !== c.invest.next });
        }
      }
      const mat = c.invest.maturity;
      if (mat && mat >= from && mat < to) {
        out.push({ kind: 'maturity', card: c, date: mat, amount: c.invest.value ?? c.invest.invested ?? c.amount ?? 0, projected: false });
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.card.rank - b.card.rank));
}

/** Groups due items by date. */
export function bucketByDay(items: DueItem[]): Map<string, DueItem[]> {
  const map = new Map<string, DueItem[]>();
  for (const it of items) {
    const list = map.get(it.date);
    if (list) list.push(it); else map.set(it.date, [it]);
  }
  return map;
}

/* ---------- expenses list ---------- */

export interface ExpenseFilter { q?: string; category?: string; mode?: string }

export function filterExpenses(list: Card[], f: ExpenseFilter): Card[] {
  const words = (f.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter(c => {
    if (f.category && (c.category || 'Other') !== f.category) return false;
    if (f.mode && (c.mode || 'UPI') !== f.mode) return false;
    if (!words.length) return true;
    const hay = [c.title, c.body, c.category, c.mode, String(c.amount ?? '')].filter(Boolean).join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

/** Newest day first; inside a day, newest entry first. */
export function groupByDay(list: Card[]): { date: string; items: Card[]; total: number }[] {
  const sorted = [...list].sort((a, b) => (a.date! > b.date! ? -1 : a.date! < b.date! ? 1 : b.createdAt - a.createdAt));
  const out: { date: string; items: Card[]; total: number }[] = [];
  for (const c of sorted) {
    const last = out[out.length - 1];
    if (last && last.date === c.date) { last.items.push(c); last.total += c.amount ?? 0; }
    else out.push({ date: c.date!, items: [c], total: c.amount ?? 0 });
  }
  return out;
}

/* ---------- number pad ---------- */

const MAX_INT_DIGITS = 8; // up to ₹9,99,99,999 per number
const MAX_LEN = 40;
const isOp = (c: string | undefined) => c === '+' || c === '-';

/** Index where the number being typed starts (just after the last + or −). */
const numStart = (s: string) => Math.max(s.lastIndexOf('+'), s.lastIndexOf('-')) + 1;

/**
 * Applies one key ("0"–"9", "00", ".", "+", "-", "=", "back") to the typed amount string.
 * Digit rules apply to the number being typed (after the last operator).
 * "=" collapses a sum like "300+200+50" to its total.
 */
export function padPress(cur: string, key: string): string {
  if (key === 'back') return cur.slice(0, -1);
  if (key === '=') {
    if (!padHasOp(cur)) return cur;
    const v = padEval(cur);
    return v > 0 ? String(v) : '';
  }
  if (isOp(key)) {
    if (!cur) return cur;
    let base = cur;
    if (isOp(base[base.length - 1]) || base.endsWith('.')) base = base.slice(0, -1);
    if (!base) return '';
    if (isOp(base[base.length - 1])) base = base.slice(0, -1); // "12+." can't happen, but stay safe
    return base.length + 1 > MAX_LEN ? cur : base + key;
  }
  const at = numStart(cur);
  const head = cur.slice(0, at);
  let num = cur.slice(at);
  if (key === '.') {
    if (num.includes('.')) return cur;
    num = (num || '0') + '.';
    return head.length + num.length > MAX_LEN ? cur : head + num;
  }
  if (!/^\d{1,2}$/.test(key)) return cur;
  for (const ch of key) {
    if (head.length + num.length >= MAX_LEN && !(num === '0' && ch !== '0')) break;
    const dot = num.indexOf('.');
    if (dot >= 0) {
      if (num.length - dot - 1 >= 2) break;
      num += ch;
    } else if (num === '0' || num === '') {
      num = ch === '0' && key === '00' && num === '' ? '' : ch;
    } else {
      if (num.length >= MAX_INT_DIGITS) break;
      num += ch;
    }
  }
  return head + num;
}

/** True when the typed amount is a sum ("300+200"). */
export const padHasOp = (s: string): boolean => /[+-]/.test(s);

/** Total of the typed amount: "300+200+50" → 550. Never negative; 0 when it can't be read. Rounded to paise. */
export function padEval(s: string): number {
  let t = s;
  if (isOp(t[t.length - 1]) || t.endsWith('.')) t = t.slice(0, -1);
  if (!t) return 0;
  const v = evalExpr(t);
  if (v === null || !Number.isFinite(v) || v < 0) return 0;
  return Math.round(v * 100) / 100;
}

export const padValue = padEval;

function fmtNum(n: string): string {
  if (!n) return '';
  const [i, d] = n.split('.');
  const int = Number(i || '0').toLocaleString('en-IN');
  return d === undefined ? int : `${int}.${d}`;
}

/** "125000+50" → "1,25,000 + 50" (Indian grouping per number, keeps what was typed after a dot). */
export function padDisplay(s: string): string {
  if (!s) return '0';
  return s.split(/([+-])/).map(p => (p === '+' ? ' + ' : p === '-' ? ' − ' : fmtNum(p))).join('');
}
