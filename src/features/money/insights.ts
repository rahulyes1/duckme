/**
 * Plain-language insights about your spending. Pure: cards + a date in, sentences out.
 * Every insight compares like with like (this month so far vs the same days last month),
 * so early-month numbers never look scary. Tested in insights.test.ts.
 */
import type { Card } from '../../lib/types';
import { addDaysISO, fmtDate, inr, toISO } from '../../lib/format';
import { isLive } from './money-util';

export type InsightKind = 'up' | 'down' | 'pace' | 'big' | 'calm' | 'weekend' | 'bills';
export interface Insight { kind: InsightKind; text: string; /** higher shows first */ weight: number }

const pad = (n: number) => String(n).padStart(2, '0');
const monthISO = (y: number, m: number) => { const d = new Date(y, m, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

export function spendingInsights(cards: Card[], ref: Date): Insight[] {
  const y = ref.getFullYear(), m = ref.getMonth(), day = ref.getDate();
  const thisM = monthISO(y, m), lastM = monthISO(y, m - 1);
  const lastMonthDays = new Date(y, m, 0).getDate();
  const sameDayLast = `${lastM}-${pad(Math.min(day, lastMonthDays))}`;
  const todayISO = toISO(ref);

  const exp = cards.filter(c => c.type === 'expense' && isLive(c) && c.date && (c.amount ?? 0) > 0);
  const now = exp.filter(c => c.date!.startsWith(thisM) && c.date! <= todayISO);
  const then = exp.filter(c => c.date!.startsWith(lastM) && c.date! <= sameDayLast);
  const sum = (l: Card[]) => l.reduce((s, c) => s + (c.amount ?? 0), 0);
  const out: Insight[] = [];

  const total = sum(now), totalThen = sum(then);
  if (now.length && then.length) {
    const diff = total - totalThen;
    if (Math.abs(diff) >= 500) {
      out.push(diff > 0
        ? { kind: 'pace', weight: 70, text: `You've spent ${inr(diff)} more than by this date last month.` }
        : { kind: 'calm', weight: 75, text: `${inr(-diff)} less than by this date last month. Nice.` });
    }
  }

  // Biggest category move, same window.
  const byCat = (l: Card[]) => l.reduce<Record<string, number>>((a, c) => { const k = c.category ?? 'Other'; a[k] = (a[k] ?? 0) + (c.amount ?? 0); return a; }, {});
  if (then.length) {
    const a = byCat(now), b = byCat(then);
    let best: { cat: string; diff: number } | null = null;
    for (const cat of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = (a[cat] ?? 0) - (b[cat] ?? 0);
      if (!best || Math.abs(d) > Math.abs(best.diff)) best = { cat, diff: d };
    }
    if (best && Math.abs(best.diff) >= 500) {
      out.push(best.diff > 0
        ? { kind: 'up', weight: 80, text: `${best.cat} is up ${inr(best.diff)} compared with this time last month.` }
        : { kind: 'down', weight: 60, text: `${best.cat} is down ${inr(-best.diff)} compared with this time last month.` });
    }
  }

  if (now.length >= 3) {
    const big = now.reduce((x, c) => ((c.amount ?? 0) > (x.amount ?? 0) ? c : x));
    const share = (big.amount ?? 0) / Math.max(total, 1);
    if (share >= 0.25) out.push({ kind: 'big', weight: 50, text: `${big.title || big.category || 'One spend'} (${inr(big.amount)}, ${fmtDate(big.date!)}) is ${Math.round(share * 100)}% of this month.` });
  }

  // No-spend days so far this month (today excluded: it isn't over yet).
  if (day >= 5 && now.length) {
    const spentDays = new Set(now.map(c => c.date));
    let free = 0;
    for (let d = 1; d < day; d++) if (!spentDays.has(`${thisM}-${pad(d)}`)) free++;
    if (free >= 3) out.push({ kind: 'calm', weight: 40, text: `${free} no-spend days so far this month.` });
  }

  // Weekends, over the last 30 days.
  const from = addDaysISO(todayISO, -29);
  const recent = exp.filter(c => c.date! >= from && c.date! <= todayISO);
  if (recent.length >= 6) {
    const wk = recent.filter(c => { const g = new Date(c.date! + 'T00:00:00').getDay(); return g === 0 || g === 6; });
    const share = sum(wk) / Math.max(sum(recent), 1);
    if (share >= 0.45) out.push({ kind: 'weekend', weight: 45, text: `${Math.round(share * 100)}% of the last 30 days' spending was on weekends.` });
  }

  // Bills landing in the next 7 days.
  const week = addDaysISO(todayISO, 7);
  const soon = cards.filter(c => c.type === 'bill' && (c.status === 'open' || c.status === 'delayed') && c.due && c.due <= week);
  if (soon.length) {
    const amt = soon.reduce((s, c) => s + (c.amount ?? 0), 0);
    out.push({ kind: 'bills', weight: 65, text: `${soon.length} bill${soon.length === 1 ? '' : 's'} worth ${inr(amt)} due in the next 7 days.` });
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, 4);
}
