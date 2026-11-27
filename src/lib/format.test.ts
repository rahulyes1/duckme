import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays, addMonths, addMonthsISO, daysLeft, fmtDate, fmtDateY, fmtDayMonth, dueLabel, dueTone, fromISO, inr, inrShort, nextSalary, salarySide, toISO,
} from './format';

describe('addMonths clamps the day', () => {
  it('31 Jan + 1 month = 28 Feb (non-leap)', () => {
    expect(toISO(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-28');
  });
  it('31 Jan + 1 month = 29 Feb (leap year)', () => {
    expect(toISO(addMonths(new Date(2028, 0, 31), 1))).toBe('2028-02-29');
  });
  it('31 Mar + 1 month = 30 Apr', () => {
    expect(addMonthsISO('2026-03-31', 1)).toBe('2026-04-30');
  });
  it('crosses years and goes backwards', () => {
    expect(addMonthsISO('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonthsISO('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonthsISO('2026-12-05', 12)).toBe('2027-12-05');
  });
  it('29 Feb + 12 months = 28 Feb', () => {
    expect(addMonthsISO('2028-02-29', 12)).toBe('2029-02-28');
  });
});

describe('ISO helpers', () => {
  it('round trip and addDays across month end', () => {
    expect(toISO(fromISO('2026-11-24'))).toBe('2026-11-24');
    expect(toISO(addDays(new Date(2026, 10, 30), 1))).toBe('2026-12-01');
  });
});

describe('nextSalary', () => {
  const ref = new Date(2026, 10, 24);
  it('day already passed → next month', () => {
    expect(toISO(nextSalary(1, ref))).toBe('2026-12-01');
  });
  it('salary day is today → today', () => {
    expect(toISO(nextSalary(24, ref))).toBe('2026-11-24');
  });
  it('later this month', () => {
    expect(toISO(nextSalary(28, ref))).toBe('2026-11-28');
  });
  it('31 in a 30-day month → last day', () => {
    expect(toISO(nextSalary(31, ref))).toBe('2026-11-30');
  });
  it('31 → 28 Feb when rolling into February', () => {
    expect(toISO(nextSalary(31, new Date(2027, 0, 31, 0, 0, 1)))).toBe('2027-02-28');
  });
  it('December rolls into January', () => {
    expect(toISO(nextSalary(1, new Date(2026, 11, 10)))).toBe('2027-01-01');
  });
});

describe('salarySide and due labels (fake clock at 24 Nov 2026)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 24, 10, 0)); });
  afterEach(() => { vi.useRealTimers(); });

  it('salary on the 1st: Nov dues are before, Dec 1 onward after', () => {
    expect(salarySide('2026-11-28', 1)).toBe('before');
    expect(salarySide('2026-11-30', 1)).toBe('before');
    expect(salarySide('2026-12-01', 1)).toBe('after');
    expect(salarySide('2026-12-15', 1)).toBe('after');
  });
  it('salary on the 28th', () => {
    expect(salarySide('2026-11-27', 28)).toBe('before');
    expect(salarySide('2026-11-28', 28)).toBe('after');
  });
  it('overdue items are before salary', () => {
    expect(salarySide('2026-11-10', 1)).toBe('before');
  });
  it('daysLeft / dueLabel / dueTone', () => {
    expect(daysLeft('2026-11-24')).toBe(0);
    expect(dueLabel('2026-11-24')).toBe('Due today');
    expect(dueLabel('2026-11-25')).toBe('Due tomorrow');
    expect(dueLabel('2026-11-30')).toBe('6 days left');
    expect(dueLabel('2026-11-21')).toBe('Overdue 3d');
    expect(dueTone('2026-11-21')).toBe('late');
    expect(dueTone('2026-11-27')).toBe('urgent');
    expect(dueTone('2026-11-28')).toBe('normal');
  });
});

describe('inr — Indian grouping', () => {
  it('lakh grouping', () => {
    expect(inr(142300)).toBe('₹1,42,300');
    expect(inr(10000000)).toBe('₹1,00,00,000');
    expect(inr(999)).toBe('₹999');
  });
  it('rounds and handles empty', () => {
    expect(inr(2399.6)).toBe('₹2,400');
    expect(inr(undefined)).toBe('₹0');
    expect(inr(null)).toBe('₹0');
  });
  it('inrShort', () => {
    expect(inrShort(18000)).toBe('₹18k');
    expect(inrShort(142300)).toBe('₹1.42L');
    expect(inrShort(25000000)).toBe('₹2.5Cr');
    expect(inrShort(640)).toBe('₹640');
  });
});

describe('friendly dates', () => {
  const now = new Date(2026, 10, 27);
  it('drops the year when it is the current year', () => {
    expect(fmtDate('2026-12-01', now)).toBe('1 Dec');
    expect(fmtDate('2026-11-28', now)).toBe('28 Nov');
  });
  it('adds the year for other years', () => {
    expect(fmtDate('2027-01-12', now)).toBe('12 Jan 2027');
    expect(fmtDate('2025-03-05T10:00', now)).toBe('5 Mar 2025');
  });
  it('fmtDayMonth never has a year; fmtDateY always does', () => {
    expect(fmtDayMonth('2027-01-12')).toBe('12 Jan');
    expect(fmtDateY('2026-12-01')).toBe('1 Dec 2026');
  });
});
