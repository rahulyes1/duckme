import { describe, expect, it } from 'vitest';
import { toISO } from '../../lib/format';
import {
  calendarCells, monthOptions, monthRange, normalizeWhen, reassignRanks, slotOf, thisSaturday, weekOptions,
  weekStart, whenForSlot, whenLabel, whenRange,
} from './when';

const ref = new Date(2026, 10, 25); // Wed 25-11-2026

describe('weekStart', () => {
  it('Wednesday goes back to Monday', () => expect(toISO(weekStart(ref))).toBe('2026-11-23'));
  it('Sunday belongs to the week that started on the Monday before', () =>
    expect(toISO(weekStart(new Date(2026, 10, 29)))).toBe('2026-11-23'));
  it('Monday is its own start', () => expect(toISO(weekStart(new Date(2026, 10, 30)))).toBe('2026-11-30'));
  it('crosses a year', () => expect(toISO(weekStart(new Date(2027, 0, 2)))).toBe('2026-12-28'));
});

describe('ranges', () => {
  it('month range is [1st, next 1st)', () => {
    const r = monthRange(new Date(2026, 11, 15));
    expect(toISO(r.start)).toBe('2026-12-01');
    expect(toISO(r.end)).toBe('2027-01-01');
  });
  it('week range from any day in it', () => {
    const r = whenRange({ unit: 'week', start: '2026-11-26' });
    expect(toISO(r.start)).toBe('2026-11-23');
    expect(toISO(r.end)).toBe('2026-11-30');
  });
  it('normalizes', () => {
    expect(normalizeWhen({ unit: 'month', start: '2026-12-17' })).toEqual({ unit: 'month', start: '2026-12-01' });
    expect(normalizeWhen({ unit: 'week', start: '2026-11-29' })).toEqual({ unit: 'week', start: '2026-11-23' });
  });
});

describe('whenLabel', () => {
  it('days', () => {
    expect(whenLabel({ unit: 'day', start: '2026-11-25' }, ref)).toBe('Today');
    expect(whenLabel({ unit: 'day', start: '2026-11-26' }, ref)).toBe('Tomorrow');
    expect(whenLabel({ unit: 'day', start: '2026-11-28' }, ref)).toBe('Sat 28 Nov');
    expect(whenLabel({ unit: 'day', start: '2026-11-20' }, ref)).toBe('Fri 20 Nov');
  });
  it('weeks', () => {
    expect(whenLabel({ unit: 'week', start: '2026-11-23' }, ref)).toBe('This week');
    expect(whenLabel({ unit: 'week', start: '2026-11-30' }, ref)).toBe('Next week');
    expect(whenLabel({ unit: 'week', start: '2026-12-07' }, ref)).toBe('Week of 7 Dec');
  });
  it('months', () => {
    expect(whenLabel({ unit: 'month', start: '2026-11-01' }, ref)).toBe('This month');
    expect(whenLabel({ unit: 'month', start: '2026-12-01' }, ref)).toBe('Next month');
    expect(whenLabel({ unit: 'month', start: '2027-01-01' }, ref)).toBe('January 2027');
  });
});

describe('options', () => {
  it('10 weeks from this Monday', () => {
    const w = weekOptions(ref);
    expect(w).toHaveLength(10);
    expect(w[0]).toEqual({ start: '2026-11-23', label: 'This week', range: '23 Nov – 29 Nov' });
    expect(w[1].label).toBe('Next week');
    expect(w[9].start).toBe('2027-01-25');
  });
  it('12 months from this one', () => {
    const m = monthOptions(ref);
    expect(m).toHaveLength(12);
    expect(m[0]).toEqual({ start: '2026-11-01', label: 'Nov 2026' });
    expect(m[11]).toEqual({ start: '2027-10-01', label: 'Oct 2027' });
  });
  it('calendar is Monday-first, 42 cells', () => {
    const c = calendarCells(ref);
    expect(c).toHaveLength(42);
    expect(toISO(c[0])).toBe('2026-10-26');
    expect(c[0].getDay()).toBe(1);
  });
  it('this Saturday', () => {
    expect(toISO(thisSaturday(ref))).toBe('2026-11-28');
    expect(toISO(thisSaturday(new Date(2026, 10, 28)))).toBe('2026-11-28');
    expect(toISO(thisSaturday(new Date(2026, 10, 29)))).toBe('2026-12-05');
  });
});

describe('slotOf', () => {
  it('this week (days and the week), overdue included', () => {
    expect(slotOf({ unit: 'day', start: '2026-11-29' }, ref)).toBe('week');
    expect(slotOf({ unit: 'week', start: '2026-11-23' }, ref)).toBe('week');
    expect(slotOf({ unit: 'day', start: '2026-11-02' }, ref)).toBe('week');
  });
  it('next week beats this month', () => {
    expect(slotOf({ unit: 'week', start: '2026-11-30' }, ref)).toBe('next');
    expect(slotOf({ unit: 'day', start: '2026-12-03' }, ref)).toBe('next');
  });
  it('this month', () => {
    expect(slotOf({ unit: 'month', start: '2026-11-01' }, ref)).toBe('month');
    expect(slotOf({ unit: 'day', start: '2026-12-20' }, new Date(2026, 11, 1))).toBe('month');
  });
  it('later', () => {
    expect(slotOf({ unit: 'month', start: '2026-12-01' }, ref)).toBe('later');
    expect(slotOf({ unit: 'week', start: '2026-12-07' }, ref)).toBe('later');
  });
  it('a new item in each section lands back in it', () => {
    for (const s of ['week', 'month', 'next', 'later'] as const) expect(slotOf(whenForSlot(s, ref), ref)).toBe(s);
  });
});

describe('reassignRanks', () => {
  it('reuses the box ranks in the new order', () => {
    const r: Record<string, number> = { a: 3, b: 10, c: 7 };
    const m = reassignRanks(['b', 'a', 'c'], id => r[id]);
    expect([...m.entries()]).toEqual([['b', 3], ['a', 7], ['c', 10]]);
  });
  it('breaks duplicate ranks', () => {
    const m = reassignRanks(['x', 'y'], () => 5);
    expect(m.get('x')!).toBeLessThan(m.get('y')!);
  });
});
