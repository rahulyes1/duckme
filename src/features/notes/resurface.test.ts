import { fmtDate } from '../../lib/format';
import { describe, expect, it } from 'vitest';
import type { Card } from '../../lib/types';
import { lastPaidForUpcoming, lastYearThisWeek, resurface } from './resurface';

let n = 0;
const card = (p: Partial<Card> & { type: Card['type'] }): Card => ({
  id: `c${++n}`, title: '', body: '', color: 'white', pinned: false, labels: [], horizon: 'none', rank: 0,
  status: 'open', links: [], createdAt: new Date(2026, 0, 1).getTime(), updatedAt: 0, ...p,
});
const ms = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 10).getTime(); };
const TODAY = '2026-11-25';

describe('lastYearThisWeek', () => {
  it('finds a bill / expense within ±7 days of a year ago, biggest amount first', () => {
    const cards = [
      card({ type: 'expense', title: 'Chai', amount: 40, date: '2025-11-24' }),
      card({ type: 'bill', title: 'Car insurance', amount: 14200, due: '2025-11-30', status: 'done' }),
      card({ type: 'expense', title: 'Too early', amount: 99999, date: '2025-11-10' }),
    ];
    expect(lastYearThisWeek(cards, TODAY)).toMatchObject({ cardId: cards[1].id, text: 'Car insurance ₹14,200', lead: 'Last year this week' });
  });
  it('uses a note creation date and skips journals, locked notes, templates and trash', () => {
    const cards = [
      card({ type: 'note', title: 'Journal', journalDate: '2025-11-25', createdAt: ms('2025-11-25') }),
      card({ type: 'note', title: 'Secret', locked: true, createdAt: ms('2025-11-25') }),
      card({ type: 'note', title: 'Tpl', labels: ['Template'], createdAt: ms('2025-11-25') }),
      card({ type: 'expense', title: 'Gone', amount: 500, date: '2025-11-25', status: 'trashed' }),
      card({ type: 'note', body: '# Diwali plan\n- sweets', createdAt: ms('2025-11-21') }),
    ];
    expect(lastYearThisWeek(cards, TODAY)).toMatchObject({ cardId: cards[4].id, text: 'Diwali plan' });
  });
  it('returns null when nothing matches', () => {
    expect(lastYearThisWeek([card({ type: 'expense', title: 'x', amount: 5, date: '2026-11-20' })], TODAY)).toBeNull();
  });
});

describe('lastPaidForUpcoming', () => {
  it('shows the last paid amount for an open bill due in the next 10 days', () => {
    const bill = card({ type: 'bill', title: 'Electricity bill', amount: 0, due: '2026-12-01' });
    const cards = [
      bill,
      card({ type: 'expense', title: 'Electricity bill paid', amount: 2100, date: '2026-09-12' }),
      card({ type: 'expense', title: 'Electricity bill paid', amount: 2350, date: '2026-10-12' }),
      card({ type: 'expense', title: 'Water bill paid', amount: 300, date: '2026-11-01' }),
    ];
    expect(lastPaidForUpcoming(cards, TODAY)).toEqual([
      { kind: 'last-paid', cardId: bill.id, lead: 'Last electricity bill', text: `₹2,350 on ${fmtDate('2026-10-12')}` },
    ]);
  });
  it('falls back to a done bill with the same title', () => {
    const bill = card({ type: 'bill', title: 'Rent', due: '2026-11-30' });
    const old = card({ type: 'bill', title: 'rent', amount: 18000, status: 'done', due: '2026-10-30', doneAt: ms('2026-10-29') });
    expect(lastPaidForUpcoming([bill, old], TODAY)[0]).toMatchObject({ lead: 'Last rent', text: `₹18,000 on ${fmtDate('2026-10-29')}` });
  });
  it('ignores bills due later than 10 days, overdue, done ones, and bills with no history', () => {
    const cards = [
      card({ type: 'bill', title: 'Far', due: '2026-12-20' }),
      card({ type: 'expense', title: 'Far paid', amount: 10, date: '2026-11-20' }),
      card({ type: 'bill', title: 'Late', due: '2026-11-20' }),
      card({ type: 'expense', title: 'Late paid', amount: 10, date: '2026-10-20' }),
      card({ type: 'bill', title: 'New one', due: '2026-11-28' }),
    ];
    expect(lastPaidForUpcoming(cards, TODAY)).toEqual([]);
  });
});

describe('resurface', () => {
  it('returns at most two lines and nothing when nothing matches', () => {
    expect(resurface([], TODAY)).toEqual([]);
    const cards = [
      card({ type: 'bill', title: 'A', due: '2026-11-26' }), card({ type: 'expense', title: 'A paid', amount: 1, date: '2026-10-26' }),
      card({ type: 'bill', title: 'B', due: '2026-11-27' }), card({ type: 'expense', title: 'B paid', amount: 2, date: '2026-10-27' }),
      card({ type: 'bill', title: 'C', due: '2026-11-28' }), card({ type: 'expense', title: 'C paid', amount: 3, date: '2026-10-28' }),
    ];
    expect(resurface(cards, TODAY).map(l => l.lead)).toEqual(['Last A', 'Last B']);
    cards.push(card({ type: 'expense', title: 'Old trip', amount: 9000, date: '2025-11-26' }));
    expect(resurface(cards, TODAY).map(l => l.kind)).toEqual(['last-year', 'last-paid']);
  });
});
