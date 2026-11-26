import { describe, expect, it } from 'vitest';
import { newCard } from '../../lib/actions';
import type { Card } from '../../lib/types';
import { isSmall, prevMonthKey, smallInMonth, topRepeats } from './small';

const e = (amount: number, date: string, p: Partial<Card> = {}): Card =>
  newCard({ type: 'expense', title: 'Chai', amount, date, category: 'Food', mode: 'Cash', ...p });

describe('isSmall', () => {
  it('counts payments strictly under ₹200', () => {
    expect(isSmall(e(199, '2026-11-01'))).toBe(true);
    expect(isSmall(e(200, '2026-11-01'))).toBe(false);
    expect(isSmall(e(0, '2026-11-01'))).toBe(false);
    expect(isSmall(e(50, '2026-11-01', { status: 'trashed' }))).toBe(false);
    expect(isSmall({ ...e(50, '2026-11-01'), type: 'bill' })).toBe(false);
  });
});

describe('smallInMonth', () => {
  const cards = [
    e(20, '2026-11-01'), e(20, '2026-11-02'), e(150, '2026-11-03', { category: 'Travel', title: 'Auto' }),
    e(60, '2026-11-30', { category: 'Groceries', title: 'Milk' }), e(15, '2026-11-04', { category: 'Other', title: 'Pen' }),
    e(500, '2026-11-05'), e(30, '2026-10-31'), e(30, '2026-12-01'),
  ];
  it('counts, totals and top 3 categories', () => {
    const s = smallInMonth(cards, '2026-11');
    expect(s.count).toBe(5);
    expect(s.total).toBe(265);
    expect(s.top.map(t => t.name)).toEqual(['Travel', 'Groceries', 'Food']);
    expect(s.top[2]).toEqual({ name: 'Food', total: 40, count: 2 });
  });
  it('handles December into January', () => {
    expect(smallInMonth(cards, '2026-12').count).toBe(1);
    expect(prevMonthKey('2026-01')).toBe('2025-12');
  });
});

describe('topRepeats', () => {
  const ref = new Date(2026, 10, 25);
  it('groups by title and amount, most repeated first', () => {
    const cards = [
      e(20, '2026-11-20'), e(20, '2026-11-21'), e(20, '2026-11-22', { title: ' chai ' }),
      e(150, '2026-11-01', { title: 'Auto', category: 'Travel' }), e(150, '2026-11-10', { title: 'Auto', category: 'Travel', mode: 'UPI' }),
      e(25, '2026-11-23'), // chai at a different price: its own group, only once
      e(60, '2026-11-01', { title: 'Milk' }),
      e(20, '2026-01-01'), // too old
      e(20, '2026-11-24', { split: { paidBy: 'me', people: [] } }), // split: left out
    ];
    const r = topRepeats(cards, ref);
    expect(r.map(x => [x.title, x.amount, x.count])).toEqual([['chai', 20, 3], ['Auto', 150, 2]]);
    expect(r[1].mode).toBe('UPI');
    expect(r[1].lastDate).toBe('2026-11-10');
  });
  it('caps at n', () => {
    const cards: Card[] = [];
    for (let i = 0; i < 8; i++) cards.push(e(10 + i, '2026-11-01', { title: `T${i}` }), e(10 + i, '2026-11-02', { title: `T${i}` }));
    expect(topRepeats(cards, ref, 5)).toHaveLength(5);
  });
});
