import { describe, expect, it } from 'vitest';
import type { Card } from './types';
import { byRank, monthSpend, gainLoss, monthTotalsByCategory, moveId, netWorth, nextDueDate, rankForNewCard, salarySplit } from './logic';

const card = (p: Partial<Card> & { type: Card['type'] }): Card => ({
  id: p.id ?? Math.random().toString(36).slice(2), title: '', body: '', color: 'white', pinned: false, labels: [],
  horizon: 'none', rank: 1, status: 'open', links: [], createdAt: 0, updatedAt: 0, ...p,
});

describe('ranking — your order is the only order', () => {
  it('a new card goes above everything', () => {
    expect(rankForNewCard([3, 1, 7])).toBe(0);
    expect(rankForNewCard([-2, 5])).toBe(-3);
    expect(rankForNewCard([])).toBe(1);
  });
  it('sorts by rank only, ignoring due dates and penalties', () => {
    const a = card({ id: 'a', type: 'bill', rank: 2, due: '2026-11-25', penalty: 'Late fee ₹900' });
    const b = card({ id: 'b', type: 'task', rank: 1, due: '2027-06-01' });
    const c = card({ id: 'c', type: 'note', rank: 3 });
    expect([a, c, b].sort(byRank).map(x => x.id)).toEqual(['b', 'a', 'c']);
  });
  it('ties fall back to id so the order is stable', () => {
    const x = card({ id: 'x', type: 'note', rank: 1 }), y = card({ id: 'y', type: 'note', rank: 1 });
    expect([y, x].sort(byRank).map(c => c.id)).toEqual(['x', 'y']);
  });
  it('moveId moves one card and keeps the rest in order', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveId(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveId(['a', 'b'], 0, 9)).toEqual(['b', 'a']);
  });
});

describe('bill repeat', () => {
  it('monthly / quarterly / yearly / none', () => {
    expect(nextDueDate('2026-11-28', 'monthly')).toBe('2026-12-28');
    expect(nextDueDate('2026-11-30', 'quarterly')).toBe('2027-02-28');
    expect(nextDueDate('2026-12-02', 'yearly')).toBe('2027-12-02');
    expect(nextDueDate('2026-12-02', 'none')).toBeNull();
    expect(nextDueDate('2026-12-02', undefined)).toBeNull();
  });
  it('31st clamps to the month end', () => {
    expect(nextDueDate('2027-01-31', 'monthly')).toBe('2027-02-28');
  });
});

describe('salary split (salary on the 1st, today 25-11-2026)', () => {
  const ref = new Date(2026, 10, 25);
  const bills = [
    card({ type: 'bill', amount: 18450, due: '2026-11-28' }),            // before
    card({ type: 'bill', amount: 500, due: '2026-11-10' }),              // overdue → before
    card({ type: 'bill', amount: 18000, due: '2026-12-05', status: 'delayed' }), // after (delayed still counts)
    card({ type: 'bill', amount: 2400, due: '2026-12-15' }),             // after
    card({ type: 'bill', amount: 999, due: '2027-01-02' }),              // beyond the next month → not counted
    card({ type: 'bill', amount: 700, due: '2026-11-27', status: 'done' }), // paid → not counted
    card({ type: 'task', amount: 100, due: '2026-11-26' }),             // not a bill
  ];
  it('splits totals and counts', () => {
    expect(salarySplit(bills, 1, ref)).toEqual({
      salaryISO: '2026-12-01', before: 18950, beforeCount: 2, after: 20400, afterCount: 2,
    });
  });
  it('salary day later this month', () => {
    const s = salarySplit(bills, 28, ref);
    expect(s.salaryISO).toBe('2026-11-28');
    expect(s.before).toBe(500);       // only the overdue one is before 28 Nov
    expect(s.after).toBe(18450 + 18000 + 2400); // 28 Nov up to 27 Dec
  });
});

describe('month totals', () => {
  const cards = [
    card({ type: 'expense', amount: 640, date: '2026-11-08', category: 'Food' }),
    card({ type: 'expense', amount: 1840, date: '2026-11-01', category: 'Groceries' }),
    card({ type: 'expense', amount: 360, date: '2026-11-20', category: 'Food' }),
    card({ type: 'expense', amount: 5000, date: '2026-10-30', category: 'Food' }),            // other month
    card({ type: 'expense', amount: 999, date: '2026-11-21', category: 'Food', status: 'trashed' }), // trashed
    card({ type: 'expense', amount: 120, date: '2026-11-22' }),                                // no category
    card({ type: 'bill', amount: 18000, date: '2026-11-05' }),                                  // not an expense
  ];
  it('totals by category, biggest first', () => {
    expect(monthTotalsByCategory(cards, '2026-11')).toEqual({
      total: 2960, byCategory: [['Groceries', 1840], ['Food', 1000], ['Other', 120]],
    });
  });
});

describe('investments — values only', () => {
  it('gain and loss from invested total', () => {
    expect(gainLoss(card({ type: 'invest', amount: 5000, invest: { kind: 'SIP', invested: 125000, value: 142300 } })))
      .toEqual({ diff: 17300, pct: 13.84 });
    const loss = gainLoss(card({ type: 'invest', amount: 50000, invest: { kind: 'Stock', value: 45000 } }))!;
    expect(loss.diff).toBe(-5000);
    expect(loss.pct).toBe(-10);
  });
  it('no gain/loss for a SIP without an invested total', () => {
    expect(gainLoss(card({ type: 'invest', amount: 5000, invest: { kind: 'SIP', value: 142300 } }))).toBeNull();
  });
  it('net worth adds current values of live investments', () => {
    const cards = [
      card({ type: 'invest', amount: 5000, invest: { kind: 'SIP', invested: 125000, value: 142300 } }),
      card({ type: 'invest', amount: 100000, invest: { kind: 'FD' } }),                    // no value typed → invested
      card({ type: 'invest', amount: 20000, invest: { kind: 'Gold', value: 26000 }, status: 'killed' }),
    ];
    expect(netWorth(cards)).toEqual({ value: 242300, invested: 225000 });
  });
});

describe('monthSpend: one "spent this month" for Home and Money', () => {
  const ref = new Date(2026, 10, 27);
  const exp = (over: Partial<Card>): Card => ({
    id: Math.random().toString(36), type: 'expense', title: 'x', amount: 100, date: '2026-11-10', status: 'open', category: 'Food', labels: [], links: [],
    createdAt: 0, updatedAt: 0, ...over,
  } as Card);
  it('counts cash and card spends, skips investments, card-bill payments, other months and future days', () => {
    const cards = [
      exp({ amount: 200, mode: 'UPI' }),
      exp({ amount: 300, mode: 'Card' }),
      exp({ amount: 5000, title: 'SIP 5000', category: 'Investment' }),
      exp({ amount: 9000, cardPayment: true } as Partial<Card>),
      exp({ amount: 700, date: '2026-10-31' }),
      exp({ amount: 800, date: '2026-11-30' }),
      exp({ amount: 50, date: '2026-11-27' }),
    ];
    const s = monthSpend(cards, ref);
    expect(s.total).toBe(550);
    expect(s.count).toBe(3);
    expect(s.today).toBe(50);
    expect(s.invested).toBe(5000);
  });
});
