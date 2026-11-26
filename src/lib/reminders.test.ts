import { describe, expect, it } from 'vitest';
import type { Card } from './types';
import { dueReminders, freshReminders } from './reminders';

const bill = (id: string, due: string, extra: Partial<Card> = {}): Card => ({
  id, type: 'bill', title: id, body: '', color: 'white', pinned: false, labels: [], horizon: 'none', rank: 1, status: 'open',
  links: [], createdAt: 0, updatedAt: 0, due, amount: 1000, ...extra,
});
const at = (d: number, h: number) => new Date(2026, 10, d, h, 0); // November 2026

describe('dueReminders', () => {
  it('reminds about bills due tomorrow, today and overdue — not later ones', () => {
    const r = dueReminders([bill('Rent', '2026-11-27'), bill('Card', '2026-11-26'), bill('Gas', '2026-11-24'), bill('Later', '2026-11-30')],
      { salaryDay: 1 }, at(26, 10));
    expect(r.map(x => x.title)).toEqual(['Gas · ₹1,000 overdue since 24-11', 'Card · ₹1,000 due today', 'Rent · ₹1,000 due tomorrow']);
  });
  it('waits until the chosen hour', () => {
    expect(dueReminders([bill('Rent', '2026-11-27')], { salaryDay: 1 }, at(26, 7))).toEqual([]);
    expect(dueReminders([bill('Rent', '2026-11-27')], { salaryDay: 1, reminders: { bills: true, salary: true, hour: 6 } }, at(26, 7))).toHaveLength(1);
  });
  it('skips paid, autopay and switched-off bills', () => {
    const cards = [bill('Paid', '2026-11-27', { status: 'done' }), bill('Auto', '2026-11-27', { autopay: { account: 'HDFC' } as Card['autopay'] })];
    expect(dueReminders(cards, { salaryDay: 1 }, at(26, 10))).toEqual([]);
    expect(dueReminders([bill('Rent', '2026-11-27')], { salaryDay: 1, reminders: { bills: false, salary: true, hour: 9 } }, at(26, 10))).toEqual([]);
  });
  it('mentions the late fee when there is one', () => {
    expect(dueReminders([bill('Card', '2026-11-27', { penalty: 'Late fee ₹900' })], { salaryDay: 1 }, at(26, 10))[0].body).toBe('Pay to avoid: Late fee ₹900');
  });
  it('salary day, clamped to the end of short months', () => {
    expect(dueReminders([], { salaryDay: 26 }, at(26, 10)).map(r => r.title)).toEqual(['Salary day']);
    expect(dueReminders([], { salaryDay: 31 }, at(30, 10)).map(r => r.title)).toEqual(['Salary day']); // November has 30 days
    expect(dueReminders([], { salaryDay: 25 }, at(26, 10))).toEqual([]);
  });
  it('each reminder shows once a day', () => {
    const r = dueReminders([bill('Rent', '2026-11-27')], { salaryDay: 1 }, at(26, 10));
    expect(freshReminders(r, [r[0].tag])).toEqual([]);
    expect(dueReminders([bill('Rent', '2026-11-27')], { salaryDay: 1 }, at(27, 10))[0].tag).not.toBe(r[0].tag);
  });
});
