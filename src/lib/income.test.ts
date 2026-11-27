import { describe, expect, it } from 'vitest';
import { allCategories, extraBetween, monthIncome, salaryIn } from './income';
import { cashFlow } from '../features/money/cashflow';
import { passbook } from '../features/money/passbook';
import type { Settings } from './types';

const ref = new Date(2026, 10, 27);
const s = { key: 'settings', salaryDay: 1, salaryAmount: 50000, theme: 'dark', budgets: {}, labels: [], delayDays: 7, consentAt: new Date(2026, 9, 5).getTime(),
  incomes: [{ id: 'a', date: '2026-11-10', amount: 2000, title: 'Refund', createdAt: 1 }, { id: 'b', date: '2026-11-29', amount: 999, title: 'Later', createdAt: 2 }] } as Settings;

describe('income', () => {
  it('counts salary once its day has come, plus extras up to today', () => {
    expect(monthIncome(s, '2026-11', ref).total).toBe(52000);
    expect(salaryIn({ ...s, salaryDay: 30 }, '2026-11', ref)).toBeNull();
  });
  it('shows no salary for months before you used the app', () => {
    expect(salaryIn(s, '2026-08', ref)).toBeNull();
    expect(salaryIn(s, '2026-10', ref)?.amount).toBe(50000);
  });
  it('adds extra income to money left and the passbook balance', () => {
    expect(extraBetween(s.incomes, '2026-11-01', '2026-12-01', '2026-11-27')).toBe(2000);
    expect(cashFlow([], 50000, 1, ref, s.incomes).left).toBe(52000);
    expect(passbook([], 50000, 1, ref, s.incomes).lines[0].balance).toBe(52000);
  });
  it('appends your own categories', () => {
    expect(allCategories(['Pet']).slice(-1)[0]).toBe('Pet');
  });
});
