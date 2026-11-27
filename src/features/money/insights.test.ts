import { describe, expect, it } from 'vitest';
import type { Card } from '../../lib/types';
import { spendingInsights } from './insights';

const ex = (date: string, amount: number, category = 'Food', title = 'x'): Card => ({
  id: date + amount + category, type: 'expense', title, body: '', color: 'white', pinned: false, labels: [], horizon: 'none',
  rank: 1, status: 'open', links: [], createdAt: 0, updatedAt: 0, date, amount, category,
});
const REF = new Date(2026, 10, 26);

describe('spendingInsights', () => {
  it('compares with the same days last month, not the whole month', () => {
    const cards = [ex('2026-11-10', 3000), ex('2026-10-10', 1000), ex('2026-10-28', 50000)];
    const ins = spendingInsights(cards, REF);
    expect(ins.find(i => i.kind === 'pace')?.text).toContain('₹2,000 more');
    expect(ins.find(i => i.kind === 'up')?.text).toContain('Food is up ₹2,000');
  });
  it('praises spending less', () => {
    const ins = spendingInsights([ex('2026-11-03', 500), ex('2026-10-03', 4000)], REF);
    expect(ins.some(i => i.kind === 'calm' && i.text.includes('₹3,500 less'))).toBe(true);
  });
  it('counts no-spend days before today', () => {
    const cards = Array.from({ length: 20 }, (_, i) => ex(`2026-11-${String(i + 1).padStart(2, '0')}`, 10));
    expect(spendingInsights(cards, REF).find(i => i.text.includes('no-spend'))?.text).toBe('5 no-spend days so far this month.');
  });
  it('flags bills due within a week', () => {
    const bill: Card = { ...ex('2026-11-01', 0), id: 'b', type: 'bill', amount: 18450, due: '2026-11-28' };
    expect(spendingInsights([bill], REF)[0].text).toBe('1 bill worth ₹18,450 due in the next 7 days.');
  });
  it('has a chip form of six words or fewer for every insight', () => {
    const cards = [ex('2026-11-10', 3000), ex('2026-10-10', 1000), ex('2026-11-03', 500), ex('2026-10-03', 4000),
      { ...ex('2026-11-01', 0), id: 'b', type: 'bill' as const, amount: 18450, due: '2026-11-28' }];
    const ins = spendingInsights(cards, REF);
    expect(ins.length).toBeGreaterThan(1);
    for (const i of ins) expect(i.short.split(/\s+/).length).toBeLessThanOrEqual(6);
    expect(ins.find(i => i.kind === 'bills')?.short).toBe('1 bill due this week');
  });
  it('says nothing when there is nothing to say', () => {
    expect(spendingInsights([], REF)).toEqual([]);
  });
});
