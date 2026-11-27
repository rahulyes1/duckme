import { describe, expect, it } from 'vitest';
import type { Card } from '../../lib/types';
import { passbook } from './passbook';

const base = (id: string, extra: Partial<Card>): Card => ({
  id, type: 'expense', title: id, body: '', color: 'white', pinned: false, labels: [], horizon: 'none', rank: 1, status: 'open', links: [],
  createdAt: 0, updatedAt: 0, ...extra,
});
const REF = new Date(2026, 10, 26);

describe('passbook', () => {
  const cards = [
    base('Petrol', { date: '2026-11-20', amount: 1500, category: 'Fuel', mode: 'Card' }),
    base('Groceries', { date: '2026-11-24', amount: 1840, category: 'Groceries', mode: 'UPI' }),
    base('Old', { date: '2026-10-30', amount: 999 }),
    base('Card bill', { type: 'bill', due: '2026-11-28', amount: 18450, penalty: 'Late fee ₹900' }),
    base('Rent', { type: 'bill', due: '2026-12-05', amount: 18000 }), // after next salary: not in this cycle
  ];

  it('salary first, spends debit, running balance oldest → newest (card spends leave via the card bill)', () => {
    const { lines } = passbook(cards, 65000, 1, REF);
    expect(lines.map(l => [l.title, l.amount, l.balance, l.kind])).toEqual([
      ['Card bill', -18450, 44710, 'due'],
      ['Groceries', -1840, 63160, 'spend'],
      ['Petrol', -1500, 65000, 'spend'],
      ['Salary', 65000, 65000, 'salary'],
    ]);
    expect(lines[0].sub).toBe('Due · Late fee ₹900');
    expect(lines[2].sub).toBe('Fuel · Card · paid via card bill');
  });
  it('without a salary: no balance, no salary line', () => {
    const { lines } = passbook(cards, 0, 1, REF);
    expect(lines.every(l => l.balance === null)).toBe(true);
    expect(lines.some(l => l.kind === 'salary')).toBe(false);
  });
});

describe('passbook SIPs', () => {
  it('SIP instalments due appear in pencil, in date order with bills', () => {
    const sip = base('Flexi cap', { type: 'invest', amount: 5000, invest: { kind: 'SIP', next: '2026-11-27' } });
    const bill = base('Card bill', { type: 'bill', due: '2026-11-28', amount: 18450 });
    const { lines } = passbook([sip, bill], 65000, 1, REF);
    expect(lines.slice(0, 2).map(l => [l.title, l.kind, l.balance])).toEqual([['Flexi cap', 'due', 60000], ['Card bill', 'due', 41550]]);
  });
});
