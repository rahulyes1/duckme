/** Income rules: salary counts itself once its day has arrived, plus whatever you add by hand. Pure. */
import type { Card, IncomeEntry, Settings } from './types';
import { EXPENSE_CATEGORIES } from './types';
import { toISO } from './format';

/** Extra income dated in [start, end) and not after today. */
export function extraBetween(incomes: IncomeEntry[] | undefined, start: string, end: string, todayIso: string): number {
  return (incomes ?? []).reduce((s, i) => (i.date >= start && i.date < end && i.date <= todayIso ? s + i.amount : s), 0);
}

/** The salary line of a month ("YYYY-MM"), or null if it has not arrived yet or there is nothing to show. */
export function salaryIn(settings: Pick<Settings, 'salaryAmount' | 'salaryDay' | 'consentAt'>, month: string, ref: Date, cards: Card[] = []): { date: string; amount: number } | null {
  const amount = settings.salaryAmount ?? 0;
  if (amount <= 0) return null;
  const [y, m] = month.split('-').map(Number);
  const day = Math.min(Math.max(1, settings.salaryDay || 1), new Date(y, m, 0).getDate());
  const date = `${month}-${String(day).padStart(2, '0')}`;
  const now = toISO(ref);
  if (date > now) return null;
  // Past months count only if you were using the app then, so old months don't show a made-up salary.
  if (month < now.slice(0, 7)) {
    const since = settings.consentAt ? toISO(new Date(settings.consentAt)).slice(0, 7) : now.slice(0, 7);
    if (month < since && !cards.some(c => c.type === 'expense' && c.date?.startsWith(month))) return null;
  }
  return { date, amount };
}

export function monthIncome(settings: Settings, month: string, ref: Date, cards: Card[] = []) {
  const salary = salaryIn(settings, month, ref, cards);
  const now = toISO(ref);
  const extras = (settings.incomes ?? []).filter(i => i.date.startsWith(month) && i.date <= now)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  return { salary, extras, total: (salary?.amount ?? 0) + extras.reduce((s, i) => s + i.amount, 0) };
}

/** Built-in categories followed by your own. */
export const allCategories = (custom: string[] | undefined): string[] => [...EXPENSE_CATEGORIES, ...(custom ?? [])];
