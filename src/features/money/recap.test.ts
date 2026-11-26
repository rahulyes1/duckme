import { describe, expect, it } from 'vitest';
import type { Card } from '../../lib/types';
import { cycleLabel, monthRecap } from './recap';

const ex = (date: string, amount: number, category = 'Food', title = 'x'): Card => ({
  id: date + amount + category + title, type: 'expense', title, body: '', color: 'white', pinned: false, labels: [], horizon: 'none',
  rank: 1, status: 'open', links: [], createdAt: 0, updatedAt: 0, date, amount, category,
});

describe('monthRecap', () => {
  const cards = [
    ex('2026-10-05', 2000), ex('2026-10-20', 18450, 'Bills', 'Credit card bill paid'), ex('2026-10-31', 500, 'Fuel'),
    ex('2026-09-10', 1000), ex('2026-11-02', 9999), // other cycles
  ];
  const r = monthRecap(cards, 65000, 1, new Date(2026, 10, 3)); // 03-11: cycle 01-10 … 31-10 just ended

  it('recaps the cycle that just ended', () => {
    expect(r.start).toBe('2026-10-01');
    expect(r.end).toBe('2026-11-01');
    expect(r.label).toBe('October');
    expect(cycleLabel(r)).toBe('01-10 to 31-10');
    expect(r.spent).toBe(20950);
    expect(r.prevSpent).toBe(1000);
  });
  it('what you kept, bills paid, top categories', () => {
    expect(r.kept).toBe(44050);
    expect(r.keptPct).toBe(68);
    expect(r.billsPaid).toBe(18450);
    expect(r.billsCount).toBe(1);
    expect(r.top[0]).toEqual({ name: 'Bills', amount: 18450, prev: 0 });
    expect(r.top[1]).toEqual({ name: 'Food', amount: 2000, prev: 1000 });
  });
  it('no-spend days and biggest spend', () => {
    expect(r.days).toBe(31);
    expect(r.noSpendDays).toBe(28);
    expect(r.biggest?.amount).toBe(18450);
  });
  it('no salary set: nothing about what you kept', () => {
    const n = monthRecap(cards, 0, 1, new Date(2026, 10, 3));
    expect(n.kept).toBeNull();
    expect(n.keptPct).toBeNull();
  });
  it('salary on the 28th', () => {
    const s = monthRecap([ex('2026-11-27', 100)], 0, 28, new Date(2026, 10, 29));
    expect([s.start, s.end]).toEqual(['2026-10-28', '2026-11-28']);
    expect(s.spent).toBe(100);
  });
});
