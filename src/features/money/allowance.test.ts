import { describe, expect, it } from 'vitest';
import type { Card } from '../../lib/types';
import { weekAllowance } from './allowance';

const ex = (date: string, amount: number, category = 'Food'): Card => ({
  id: date + amount + category, type: 'expense', title: 'x', body: '', color: 'white', pinned: false, labels: [], horizon: 'none',
  rank: 1, status: 'open', links: [], createdAt: 0, updatedAt: 0, date, amount, category,
});

describe('weekAllowance', () => {
  // Thu 26-11-2026 → week Mon 23-11 … Sun 29-11
  const ref = new Date(2026, 10, 26);
  it('counts Monday to Sunday, skips bills and rent', () => {
    const w = weekAllowance([ex('2026-11-23', 500), ex('2026-11-26', 300), ex('2026-11-22', 999), ex('2026-11-24', 18000, 'Rent'), ex('2026-11-25', 650, 'Bills')], 3500, ref);
    expect([w.start, w.end]).toEqual(['2026-11-23', '2026-11-29']);
    expect(w.spent).toBe(800);
    expect(w.left).toBe(2700);
    expect(w.daysLeft).toBe(4);
    expect(w.perDay).toBe(675);
  });
  it('over the allowance', () => {
    const w = weekAllowance([ex('2026-11-24', 4000)], 3500, ref);
    expect(w.over).toBe(500);
    expect(w.left).toBe(0);
    expect(w.frac).toBe(1);
  });
  it('Sunday is the last day', () => {
    expect(weekAllowance([], 700, new Date(2026, 10, 29)).daysLeft).toBe(1);
  });
});
