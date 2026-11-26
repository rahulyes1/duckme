/**
 * Savings goals, loans/EMIs and the expenses CSV: pure maths, no DB, no UI (tested in goals.test.ts).
 */
import type { Card, Goal, Loan } from '../../lib/types';
import { fromISO } from '../../lib/format';

/* ---------- goals ---------- */

/** Whole months from `ref` to `by` (at least 1 while the date is ahead; 0 when it has passed). */
export function monthsUntil(by: string, ref: Date): number {
  const d = fromISO(by);
  if (d <= ref) return 0;
  const m = (d.getFullYear() - ref.getFullYear()) * 12 + (d.getMonth() - ref.getMonth()) - (d.getDate() < ref.getDate() ? 1 : 0);
  return Math.max(1, m);
}

export interface GoalProgress { frac: number; left: number; perMonth: number | null; months: number | null; done: boolean; late: boolean }

export function goalProgress(g: Goal, ref: Date): GoalProgress {
  const left = Math.max(0, g.target - g.saved);
  const frac = g.target > 0 ? Math.min(1, g.saved / g.target) : 0;
  const done = g.target > 0 && g.saved >= g.target;
  if (!g.by || done) return { frac, left, perMonth: null, months: null, done, late: false };
  const months = monthsUntil(g.by, ref);
  if (months === 0) return { frac, left, perMonth: left, months: 0, done, late: true };
  return { frac, left, perMonth: Math.ceil(left / months), months, done, late: false };
}

/* ---------- loans ---------- */

/** Standard EMI for principal P, yearly rate %, n months. */
export function emiFor(principal: number, ratePct: number, months: number): number {
  if (months <= 0) return 0;
  const r = ratePct / 1200;
  if (r === 0) return Math.round(principal / months);
  const f = Math.pow(1 + r, months);
  return Math.round((principal * r * f) / (f - 1));
}

/** EMIs paid so far: one per month since the first EMI date, counting the first one (0 before it starts). */
export function emisPaid(firstEmi: string, ref: Date): number {
  const d = fromISO(firstEmi);
  if (d > ref) return 0;
  const m = (ref.getFullYear() - d.getFullYear()) * 12 + (ref.getMonth() - d.getMonth()) - (ref.getDate() < d.getDate() ? 1 : 0);
  return m + 1;
}

export interface LoanStatus {
  paid: number;
  outstanding: number;
  monthsLeft: number;
  interestLeft: number;
  /** Share of principal repaid (0–1). */
  frac: number;
  /** When the last EMI lands (YYYY-MM-DD), or null if the EMI never covers interest. */
  endISO: string | null;
}

/** Amortise month by month: interest on the balance, the rest of the EMI repays principal. */
export function loanStatus(l: Loan, ref: Date): LoanStatus {
  const r = l.rate / 1200;
  const paid = emisPaid(l.firstEmi, ref);
  let bal = l.principal;
  for (let i = 0; i < paid && bal > 0; i++) bal = Math.max(0, bal + bal * r - l.emi);
  const outstanding = Math.round(bal);
  if (outstanding <= 0) return { paid, outstanding: 0, monthsLeft: 0, interestLeft: 0, frac: 1, endISO: null };
  if (l.emi <= bal * r) return { paid, outstanding, monthsLeft: Infinity, interestLeft: Infinity, frac: 1 - outstanding / l.principal, endISO: null };
  let months = 0, interest = 0, b = bal;
  while (b > 0.5 && months < 1200) { const int = b * r; interest += int; b = b + int - l.emi; months++; }
  const first = fromISO(l.firstEmi);
  const end = new Date(first.getFullYear(), first.getMonth() + paid + months - 1, first.getDate());
  const iso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return { paid, outstanding, monthsLeft: months, interestLeft: Math.round(interest), frac: Math.max(0, 1 - outstanding / l.principal), endISO: iso };
}

/** How much interest and how many months a one-time prepayment saves (EMI unchanged, tenure shrinks). */
export function prepaySaving(l: Loan, amount: number, ref: Date): { months: number; interest: number } {
  const now = loanStatus(l, ref);
  if (!isFinite(now.monthsLeft) || amount <= 0 || now.outstanding <= 0) return { months: 0, interest: 0 };
  const r = l.rate / 1200;
  let b = Math.max(0, now.outstanding - amount), months = 0, interest = 0;
  while (b > 0.5 && months < 1200) { const int = b * r; interest += int; b = b + int - l.emi; months++; }
  return { months: now.monthsLeft - months, interest: Math.round(now.interestLeft - interest) };
}

/* ---------- CSV ---------- */

const csvCell = (v: string | number | undefined) => {
  const s = v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Expenses as CSV (Date DD-MM-YYYY, Title, Category, Mode, Amount), oldest first. Opens in Excel/Sheets. */
export function expensesCsv(cards: Card[]): string {
  const rows = cards
    .filter(c => c.type === 'expense' && c.status !== 'trashed' && c.status !== 'killed' && c.date)
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : 0))
    .map(c => {
      const [y, m, d] = c.date!.split('-');
      return [`${d}-${m}-${y}`, c.title, c.category ?? 'Other', c.mode ?? '', c.amount ?? 0].map(csvCell).join(',');
    });
  return ['Date,Title,Category,Mode,Amount (INR)', ...rows].join('\n');
}
