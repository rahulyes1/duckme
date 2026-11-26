/**
 * Investment maths, Indian bank conventions. Pure; tested in invest-math.test.ts.
 * FD/RD compound quarterly; SIP projections compound monthly.
 */
import { fromISO, toISO } from '../../lib/format';

const DAY = 86400000;
const years = (from: string, to: string) => Math.max(0, (fromISO(to).getTime() - fromISO(from).getTime()) / DAY / 365);

/** Date `months` after `start` (clamped to month end). */
export function addMonthsISO(start: string, months: number): string {
  const d = fromISO(start);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toISO(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last)));
}

/** FD value on `asOf` (capped at maturity): P(1 + r/4)^(4t). */
export function fdValue(principal: number, ratePct: number, start: string, maturity: string, asOf: string): number {
  const end = asOf < maturity ? asOf : maturity;
  return Math.round(principal * Math.pow(1 + ratePct / 400, 4 * years(start, end)));
}

/** RD: each monthly instalment made by `asOf` compounds quarterly until `asOf` (or maturity). */
export function rdValue(monthly: number, ratePct: number, start: string, maturity: string, asOf: string): { value: number; paid: number; count: number } {
  const end = asOf < maturity ? asOf : maturity;
  let value = 0, count = 0;
  for (let i = 0; ; i++) {
    const d = addMonthsISO(start, i);
    if (d > end || d >= maturity) break;
    value += monthly * Math.pow(1 + ratePct / 400, 4 * years(d, end));
    count++;
  }
  return { value: Math.round(value), paid: monthly * count, count };
}

/** Future value of a monthly SIP (paid at the start of each month), with an optional yearly step-up. */
export function sipFutureValue(monthly: number, annualPct: number, months: number, stepUpPct = 0): number {
  const i = annualPct / 1200;
  let v = 0, p = monthly;
  for (let m = 0; m < months; m++) {
    if (m > 0 && m % 12 === 0) p *= 1 + stepUpPct / 100;
    v = (v + p) * (1 + i);
  }
  return Math.round(v);
}

/** Monthly SIP needed to reach `goal` in `months` at `annualPct`. */
export function sipNeeded(goal: number, annualPct: number, months: number): number {
  if (months <= 0) return goal;
  const i = annualPct / 1200;
  if (i === 0) return Math.ceil(goal / months);
  return Math.ceil((goal * i) / ((Math.pow(1 + i, months) - 1) * (1 + i)));
}

/** PPF balance after `years` more years of `yearly` deposits at `ratePct` (annual compounding), starting from `balance`. */
export function ppfProjection(balance: number, yearly: number, ratePct: number, yearsLeft: number): number {
  let b = balance;
  for (let y = 0; y < yearsLeft; y++) b = (b + Math.min(yearly, 150000)) * (1 + ratePct / 100);
  return Math.round(b);
}

/** Gold value from grams, purity and the INR price per gram of 24K, plus an Indian retail markup. */
export function goldValue(grams: number, purity: 24 | 22 | 18, inrPerGram24: number, markupPct = 8): number {
  return Math.round(grams * (purity / 24) * inrPerGram24 * (1 + markupPct / 100));
}

/** "25-11-2026" (mfapi) → "2026-11-25". */
export const mfDate = (s: string): string => `${s.slice(6, 10)}-${s.slice(3, 5)}-${s.slice(0, 2)}`;

/** Rank fund search results: Direct + Growth first, IDCW/dividend last. */
export function rankSchemes<T extends { schemeName: string }>(list: T[]): T[] {
  const score = (n: string) => {
    const s = n.toLowerCase();
    return (s.includes('direct') ? 0 : 2) + (s.includes('growth') ? 0 : 1) + (/idcw|dividend|bonus/.test(s) ? 3 : 0);
  };
  return [...list].sort((a, b) => score(a.schemeName) - score(b.schemeName) || a.schemeName.length - b.schemeName.length);
}
