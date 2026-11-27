/** Budget pace: where your spending stands against where today falls in the month. Pure. */
import type { Card, Settings } from '../../lib/types';
import { toISO } from '../../lib/format';
import { monthSpend } from '../../lib/logic';
import { spentByCategory } from './cashflow';

export interface Pace { spent: number; limit: number; spentFrac: number; todayFrac: number; left: number; over: number; daysLeft: number; perDay: number; fast: boolean }

export const monthFrac = (ref: Date): number => ref.getDate() / new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();

export function pace(spent: number, limit: number, ref: Date): Pace {
  const days = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const daysLeft = days - ref.getDate() + 1; // today still counts
  const left = Math.max(0, limit - spent);
  const todayFrac = monthFrac(ref);
  return { spent, limit, spentFrac: spent / limit, todayFrac, left, over: Math.max(0, spent - limit), daysLeft, perDay: Math.floor(left / daysLeft), fast: spent / limit > todayFrac };
}

/** Your whole-month budget if set; otherwise the category budgets added up (counting only those categories). */
export function monthPace(cards: Card[], settings: Pick<Settings, 'monthBudget' | 'budgets'>, ref: Date): (Pace & { scope: 'all' | 'categories' }) | null {
  if (settings.monthBudget) return { ...pace(monthSpend(cards, ref).total, settings.monthBudget, ref), scope: 'all' };
  const set = Object.entries(settings.budgets ?? {}).filter(([, v]) => v > 0);
  if (!set.length) return null;
  const by = spentByCategory(cards, toISO(ref).slice(0, 7));
  return { ...pace(set.reduce((a, [k]) => a + (by[k] ?? 0), 0), set.reduce((a, [, v]) => a + v, 0), ref), scope: 'categories' };
}
