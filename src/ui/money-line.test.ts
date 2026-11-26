import { describe, expect, it } from 'vitest';
import type { Card } from '../lib/types';
import { linePath, moneyLine } from './money-line';

const ex = (date: string, amount: number, status: Card['status'] = 'open'): Card => ({
  id: date + amount, type: 'expense', title: 'x', body: '', color: 'white', pinned: false, labels: [], horizon: 'none',
  rank: 1, status, links: [], createdAt: 0, updatedAt: 0, date, amount,
});
const REF = new Date(2026, 10, 26); // 26-11-2026, salary on the 1st → cycle 01-11 … 30-11

describe('moneyLine', () => {
  it('balance falls with each day of spending', () => {
    const l = moneyLine([ex('2026-11-01', 1000), ex('2026-11-03', 500), ex('2026-11-03', 200)], 50000, 1, REF);
    expect(l.real).toBe(true);
    expect(l.totalDays).toBe(30);
    expect(l.values).toHaveLength(26);
    expect(l.values[0]).toBe(49000);
    expect(l.values[2]).toBe(48300);
    expect(l.values[25]).toBe(48300);
  });
  it('without a salary it shows spending going down from zero', () => {
    const l = moneyLine([ex('2026-11-02', 300)], undefined, 1, REF);
    expect(l.values[0]).toBe(0);
    expect(l.values[1]).toBe(-300);
  });
  it('ignores other cycles and trashed expenses', () => {
    const l = moneyLine([ex('2026-10-30', 999), ex('2026-11-05', 100, 'trashed')], 1000, 1, REF);
    expect(l.real).toBe(false);
  });
  it('salary on the 28th: cycle starts on the last 28th', () => {
    const l = moneyLine([ex('2026-11-25', 100)], 1000, 28, REF);
    expect(l.values).toHaveLength(30); // 28-10 … 26-11
    expect(l.values[l.values.length - 1]).toBe(900);
  });
});

describe('linePath', () => {
  it('stays inside the drawing with padding', () => {
    const { d, lastX, lastY } = linePath({ values: [10, 5, 8], totalDays: 3, real: true });
    expect(d.startsWith('M0.0 30.0')).toBe(true);
    expect(lastX).toBe(1000);
    expect(lastY).toBeGreaterThan(30);
    expect(lastY).toBeLessThan(270);
  });
});
