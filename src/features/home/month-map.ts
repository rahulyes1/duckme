/** Month Map: five weeks of days (three past, this one, the next) with spending, bills and salary day. Pure. */
import type { Card, Settings } from '../../lib/types';
import { isActive } from '../../lib/types';
import { addDays, toISO } from '../../lib/format';
import { isSpend } from '../../lib/logic';

export interface MapDay {
  iso: string; date: number; spent: number; spends: Card[]; bills: Card[]; salary: boolean;
  future: boolean; today: boolean; /** 0 = nothing spent, 4 = among the heaviest days shown. */ heat: 0 | 1 | 2 | 3 | 4;
}

export function monthMap(cards: Card[], settings: Pick<Settings, 'salaryDay' | 'salaryAmount'>, ref: Date): MapDay[] {
  const now = toISO(ref);
  const start = addDays(ref, -((ref.getDay() + 6) % 7) - 21); // Monday, three weeks back
  const days: MapDay[] = Array.from({ length: 35 }, (_, i) => {
    const d = addDays(start, i), iso = toISO(d);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return {
      iso, date: d.getDate(), spent: 0, spends: [], bills: [], heat: 0, future: iso > now, today: iso === now,
      salary: !!settings.salaryAmount && d.getDate() === Math.min(Math.max(1, settings.salaryDay || 1), last),
    };
  });
  const at = new Map(days.map(d => [d.iso, d]));
  for (const c of cards) {
    if (isSpend(c) && c.date) {
      const d = at.get(c.date);
      if (d && !d.future) { d.spends.push(c); d.spent += c.amount ?? 0; }
    } else if (c.type === 'bill' && c.due && isActive(c)) {
      at.get(c.due)?.bills.push(c);
    }
  }
  // Square root keeps small days visible next to one big purchase.
  const max = Math.max(1, ...days.map(d => d.spent));
  for (const d of days) if (d.spent > 0) d.heat = Math.max(1, Math.ceil(Math.sqrt(d.spent / max) * 4)) as MapDay['heat'];
  return days;
}
