/**
 * Household staff ledger: pure rules, no database and no UI (unit tested in staff.test.ts).
 * A staff member is a monthly repeating bill card with `staff` info (role, advance, log).
 */
import { inr } from '../../lib/format';
import type { StaffEntry, StaffInfo } from '../../lib/types';

export const STAFF_ROLES = ['Maid', 'Cook', 'Driver', 'Nanny', 'Gardener', 'Landlord', 'Other'] as const;
export type StaffRole = typeof STAFF_ROLES[number];
export const STAFF_CATEGORY = 'Staff';

/** Days in a pay month for pro-rata leave and extra-day pay. */
export const PAY_MONTH_DAYS = 30;

const money = (n: number) => Math.round(n * 100) / 100;
const nonNeg = (n: number | undefined) => (n && Number.isFinite(n) && n > 0 ? n : 0);

/** One day's pay: monthly pay ÷ 30. */
export function perDayRate(monthlyPay: number, days = PAY_MONTH_DAYS): number {
  return days > 0 ? money(nonNeg(monthlyPay) / days) : 0;
}

/** Pro-rata leave cut: days × day rate (default pay ÷ 30). Never more than the month's pay. */
export function leaveDeduction(monthlyPay: number, leaveDays: number, rate = perDayRate(monthlyPay)): number {
  return money(Math.min(nonNeg(monthlyPay), nonNeg(leaveDays) * nonNeg(rate)));
}

/** Default advance recovery: the whole advance, but never more than one month's pay. */
export function defaultRecovery(advance: number, monthlyPay: number): number {
  return money(Math.min(nonNeg(advance), nonNeg(monthlyPay)));
}

export interface NetPayInput {
  base: number;
  leaveDays?: number;
  /** ₹ per leave day; defaults to base ÷ 30. */
  leaveRate?: number;
  extraDays?: number;
  /** ₹ per extra day; defaults to base ÷ 30. */
  extraRate?: number;
  /** Advance to recover this month. Clamped to the outstanding advance. */
  recovery?: number;
  advance?: number;
  bonus?: number;
}

export interface NetPay {
  base: number;
  leaveCut: number;
  extraPay: number;
  recovery: number;
  bonus: number;
  /** base − leave + extra − recovery + bonus, never below ₹0. */
  net: number;
}

export function netPay(i: NetPayInput): NetPay {
  const base = nonNeg(i.base);
  const leaveCut = leaveDeduction(base, nonNeg(i.leaveDays), i.leaveRate ?? perDayRate(base));
  const extraPay = money(nonNeg(i.extraDays) * nonNeg(i.extraRate ?? perDayRate(base)));
  const bonus = nonNeg(i.bonus);
  const gross = base - leaveCut + extraPay + bonus;
  let recovery = nonNeg(i.recovery);
  if (i.advance !== undefined) recovery = Math.min(recovery, nonNeg(i.advance));
  recovery = money(Math.min(recovery, Math.max(0, gross)));
  return { base, leaveCut, extraPay, recovery, bonus, net: money(Math.max(0, gross - recovery)) };
}

/* ---------- reading the log ---------- */

/** Total days of `kind` entries dated in a month ("YYYY-MM"). */
export function daysInMonth(log: StaffEntry[], kind: 'leave' | 'extra', month: string): number {
  return log.filter(e => e.kind === kind && e.date.startsWith(month)).reduce((s, e) => s + nonNeg(e.days), 0);
}

/** Leave / extra days logged after the last 'paid' entry: what this pay should settle. */
export function daysSinceLastPaid(log: StaffEntry[], kind: 'leave' | 'extra'): number {
  let i = log.length - 1;
  let total = 0;
  for (; i >= 0; i--) {
    const e = log[i];
    if (e.kind === 'paid') break;
    if (e.kind === kind) total += nonNeg(e.days);
  }
  return total;
}

/** Newest first, at most n. */
export function recentLog(log: StaffEntry[], n = 10): StaffEntry[] {
  return [...log].reverse().slice(0, n);
}

/** October / November: Diwali and annual-bonus season. `month` is 0-based like Date#getMonth. */
export const isFestivalSeason = (month: number): boolean => month === 9 || month === 10;

/* ---------- writing the log (returns new StaffInfo) ---------- */

export function addAdvance(s: StaffInfo, amount: number, date: string, id: string, note?: string): StaffInfo {
  const a = nonNeg(amount);
  if (!a) return s;
  return { ...s, advance: money(nonNeg(s.advance) + a), log: [...s.log, { id, date, kind: 'advance', amount: a, ...(note ? { note } : {}) }] };
}

export function addStaffDays(s: StaffInfo, kind: 'leave' | 'extra', days: number, date: string, id: string): StaffInfo {
  const d = nonNeg(days);
  if (!d) return s;
  return { ...s, log: [...s.log, { id, date, kind, days: d }] };
}

/** Logs a payment: reduces the advance by what was recovered, and records the bonus separately. */
export function recordPayment(s: StaffInfo, p: NetPay, date: string, ids: [string, string], mode?: string): StaffInfo {
  const parts: string[] = [];
  if (p.leaveCut) parts.push(`leave −${inr(p.leaveCut)}`);
  if (p.extraPay) parts.push(`extra +${inr(p.extraPay)}`);
  if (p.recovery) parts.push(`advance −${inr(p.recovery)}`);
  if (p.bonus) parts.push(`bonus +${inr(p.bonus)}`);
  if (mode) parts.push(mode);
  const log: StaffEntry[] = [...s.log, { id: ids[0], date, kind: 'paid', amount: p.net, ...(parts.length ? { note: parts.join(', ') } : {}) }];
  if (p.bonus) log.push({ id: ids[1], date, kind: 'bonus', amount: p.bonus });
  return { ...s, advance: money(Math.max(0, nonNeg(s.advance) - p.recovery)), log };
}
