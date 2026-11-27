import { describe, expect, it } from 'vitest';
import type { Card } from '../../lib/types';
import { newCard } from '../../lib/actions';
import { aheadItems, salaryJustLanded } from './helpers';

const REF = new Date(2026, 10, 27);
const SAL = '2026-12-01';
let n = 0;
const mk = (p: Partial<Card> & { type: Card['type'] }): Card => newCard({ id: `c${++n}`, rank: n, ...p });

describe('aheadItems', () => {
  it('yearly / quarterly / one-time bills after salary, expiries and maturities in 60 days, by date', () => {
    const cards = [
      mk({ type: 'bill', title: 'LIC', amount: 24000, due: '2027-01-06', repeat: 'yearly' }),
      mk({ type: 'bill', title: 'Rent', amount: 18000, due: '2026-12-05', repeat: 'monthly' }),
      mk({ type: 'bill', title: 'CC before salary', amount: 5000, due: '2026-11-28', repeat: 'none' }),
      mk({ type: 'bill', title: 'Car insurance far', amount: 9000, due: '2027-03-01', repeat: 'yearly' }),
      mk({ type: 'bill', title: 'Paid AMC', amount: 2000, due: '2026-12-10', repeat: 'yearly', status: 'done' }),
      mk({ type: 'bill', title: 'Water purifier AMC', amount: 2000, due: '2026-12-10', repeat: 'quarterly' }),
      mk({ type: 'note', title: 'Health policy', expiry: '2026-12-20' }),
      mk({ type: 'note', title: 'Old warranty', expiry: '2026-11-20' }),
      mk({ type: 'invest', title: 'FD', amount: 100000, invest: { kind: 'FD', value: 104200, maturity: '2027-01-20' } }),
    ];
    const r = aheadItems(cards, REF, SAL);
    expect(r.map(i => [i.card.title, i.kind, i.date, i.amount])).toEqual([
      ['Water purifier AMC', 'bill', '2026-12-10', 2000],
      ['Health policy', 'expiry', '2026-12-20', 0],
      ['LIC', 'bill', '2027-01-06', 24000],
      ['FD', 'maturity', '2027-01-20', 104200],
    ]);
  });
  it('nothing coming: empty', () => {
    expect(aheadItems([], REF, SAL)).toEqual([]);
  });
});

describe('salaryJustLanded', () => {
  it('true on salary day and the two days after', () => {
    expect(salaryJustLanded('2026-11-27', REF)).toBe(true);
    expect(salaryJustLanded('2026-11-25', REF)).toBe(true);
    expect(salaryJustLanded('2026-11-24', REF)).toBe(false);
    expect(salaryJustLanded('2026-11-01', REF)).toBe(false);
  });
});
