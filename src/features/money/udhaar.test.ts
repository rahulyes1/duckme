import { fmtDate } from '../../lib/format';
import { describe, expect, it } from 'vitest';
import type { UdhaarEntry } from '../../lib/types';
import { settleAll, udhaarMessage, udhaarPeople, udhaarTotals } from './udhaar';

const e = (id: string, name: string, dir: 'lent' | 'borrowed', amount: number, date: string, settled = false): UdhaarEntry =>
  ({ id, name, dir, amount, date, settled, createdAt: 0 });

describe('udhaar', () => {
  const list = [e('1', 'Ravi', 'lent', 2000, '2026-10-12'), e('2', 'ravi ', 'borrowed', 500, '2026-11-01'), e('3', 'Neha', 'borrowed', 300, '2026-11-20'), e('4', 'Old', 'lent', 100, '2026-01-01', true)];
  it('nets per person, case-insensitive', () => {
    const p = udhaarPeople(list);
    expect(p.map(x => [x.name, x.net])).toEqual([['Ravi', 1500], ['Neha', -300], ['Old', 0]]);
    expect(p[0].since).toBe('2026-10-12');
    expect(udhaarTotals(p)).toEqual({ owedToMe: 1500, iOwe: 300 });
  });
  it('settling clears only that person', () => {
    const s = settleAll(list, 'RAVI', 5);
    expect(udhaarPeople(s).find(x => x.name === 'Ravi')?.net).toBe(0);
    expect(udhaarPeople(s).find(x => x.name === 'Neha')?.net).toBe(-300);
  });
  it('reminder message with UPI link', () => {
    const m = udhaarMessage(udhaarPeople(list)[0], { id: 'me@okhdfc', name: 'Me' });
    expect(m).toContain(`${fmtDate('2026-10-12')}: I lent you ₹2,000`);
    expect(m).toContain(`${fmtDate('2026-11-01')}: you lent me ₹500`);
    expect(m).toContain('Total: ₹1,500 to me');
    expect(m).toContain('upi://pay?pa=me%40okhdfc');
  });
});
