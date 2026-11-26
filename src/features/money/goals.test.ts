import { describe, expect, it } from 'vitest';
import type { Card, Loan } from '../../lib/types';
import { emiFor, emisPaid, expensesCsv, goalProgress, loanStatus, monthsUntil, prepaySaving } from './goals';

const REF = new Date(2026, 10, 26); // 26-11-2026

describe('goals', () => {
  it('months until a date', () => {
    expect(monthsUntil('2027-03-26', REF)).toBe(4);
    expect(monthsUntil('2027-03-25', REF)).toBe(3);
    expect(monthsUntil('2026-12-01', REF)).toBe(1);
    expect(monthsUntil('2026-11-20', REF)).toBe(0);
  });
  it('per-month amount to hit the target on time', () => {
    const p = goalProgress({ id: 'g', name: 'Goa', target: 40000, saved: 10000, by: '2027-03-26', createdAt: 0 }, REF);
    expect(p.left).toBe(30000);
    expect(p.perMonth).toBe(7500);
    expect(p.frac).toBeCloseTo(0.25);
    expect(p.done).toBe(false);
  });
  it('done and late goals', () => {
    expect(goalProgress({ id: 'g', name: 'x', target: 100, saved: 120, createdAt: 0 }, REF).done).toBe(true);
    const late = goalProgress({ id: 'g', name: 'x', target: 100, saved: 40, by: '2026-10-01', createdAt: 0 }, REF);
    expect(late.late).toBe(true);
    expect(late.perMonth).toBe(60);
  });
});

describe('loans', () => {
  it('EMI formula matches bank calculators', () => {
    expect(emiFor(1000000, 9, 240)).toBe(8997); // 10 L, 9%, 20 years
    expect(emiFor(120000, 0, 12)).toBe(10000);
  });
  it('counts EMIs paid including the first', () => {
    expect(emisPaid('2026-11-05', REF)).toBe(1);
    expect(emisPaid('2026-11-27', REF)).toBe(0);
    expect(emisPaid('2025-11-26', REF)).toBe(13);
  });
  const car: Loan = { id: 'l', name: 'Car', principal: 500000, rate: 10, emi: emiFor(500000, 10, 60), firstEmi: '2025-12-05', createdAt: 0 };
  it('outstanding and months left add up to the original tenure', () => {
    const s = loanStatus(car, REF); // 12 EMIs paid
    expect(s.paid).toBe(12);
    expect(s.monthsLeft).toBe(48);
    expect(s.outstanding).toBeGreaterThan(400000);
    expect(s.outstanding).toBeLessThan(420000);
    expect(s.endISO).toBe('2030-11-05');
  });
  it('prepaying saves months and interest', () => {
    const save = prepaySaving(car, 100000, REF);
    expect(save.months).toBeGreaterThan(10);
    expect(save.interest).toBeGreaterThan(20000);
  });
  it('an EMI too small to cover interest never ends', () => {
    expect(loanStatus({ ...car, emi: 100 }, REF).monthsLeft).toBe(Infinity);
  });
});

const bill = (id: string, amount: number, repeat: Card['repeat'], status: Card['status'] = 'open'): Card => ({
  id, type: 'bill', title: id, body: '', color: 'white', pinned: false, labels: [], horizon: 'none', rank: 1, status, links: [],
  createdAt: 0, updatedAt: 0, amount, repeat, due: '2026-12-01',
});

describe('expensesCsv', () => {
  it('writes DD-MM-YYYY dates and quotes commas', () => {
    const e = { ...bill('x', 0, 'none'), type: 'expense' as const, title: 'Dinner, Goa', amount: 1200, date: '2026-11-02', category: 'Food', mode: 'UPI' };
    expect(expensesCsv([e]).split('\n')[1]).toBe('02-11-2026,"Dinner, Goa",Food,UPI,1200');
  });
});
