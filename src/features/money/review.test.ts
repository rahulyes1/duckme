import { describe, expect, it } from 'vitest';
import { newCard } from '../../lib/actions';
import type { Card } from '../../lib/types';
import {
  inPaydayWindow, isSunday, lastCycleLeftover, liveStreak, paydayKey, parseTicks, reviewedThisWeek, updateStreak, weekKey, weekRange,
  weekSummary,
} from './review';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('weekRange', () => {
  it('Monday to Sunday around a Wednesday', () => {
    expect(weekRange(d(2026, 11, 25))).toEqual({ start: '2026-11-23', sunday: '2026-11-29', end: '2026-11-30' });
  });
  it('a Sunday is the last day of its week', () => {
    expect(isSunday(d(2026, 11, 29))).toBe(true);
    expect(weekRange(d(2026, 11, 29)).start).toBe('2026-11-23');
  });
  it('crosses month and year ends', () => {
    expect(weekRange(d(2027, 1, 1))).toEqual({ start: '2026-12-28', sunday: '2027-01-03', end: '2027-01-04' });
  });
});

describe('streak', () => {
  it('first review starts at 1', () => {
    expect(updateStreak(undefined, undefined, '2026-11-29')).toEqual({ streak: 1, already: false });
  });
  it('next Sunday adds one', () => {
    expect(updateStreak(3, '2026-11-22', '2026-11-29')).toEqual({ streak: 4, already: false });
  });
  it('reviewing again the same week changes nothing', () => {
    expect(updateStreak(4, '2026-11-29', '2026-11-29')).toEqual({ streak: 4, already: true });
    expect(updateStreak(4, '2026-11-24', '2026-11-29')).toEqual({ streak: 4, already: true });
  });
  it('a midweek review counts for that week', () => {
    expect(updateStreak(2, '2026-11-18', '2026-11-25')).toEqual({ streak: 3, already: false });
  });
  it('missing a Sunday resets to 1', () => {
    expect(updateStreak(9, '2026-11-15', '2026-11-29')).toEqual({ streak: 1, already: false });
  });
  it('live streak shows 0 once a week was missed', () => {
    expect(liveStreak(5, '2026-11-22', '2026-11-25')).toBe(5);
    expect(liveStreak(5, '2026-11-15', '2026-11-25')).toBe(0);
    expect(liveStreak(undefined, undefined, '2026-11-25')).toBe(0);
    expect(reviewedThisWeek('2026-11-23', '2026-11-29')).toBe(true);
    expect(weekKey('2026-11-30')).toBe('2026-12-06');
  });
});

describe('weekSummary', () => {
  const cards: Card[] = [
    newCard({ type: 'expense', amount: 500, date: '2026-11-23', category: 'Food' }),
    newCard({ type: 'expense', amount: 50, date: '2026-11-24', category: 'Food' }),
    newCard({ type: 'expense', amount: 700, date: '2026-11-25', category: 'Travel' }),
    newCard({ type: 'expense', amount: 999, date: '2026-11-22', category: 'Travel' }), // last week
    newCard({ type: 'bill', amount: 1000, due: '2026-11-30', title: 'Card' }),
    newCard({ type: 'bill', amount: 300, due: '2026-11-20', title: 'Late' }),
    newCard({ type: 'bill', amount: 300, due: '2026-12-09', title: 'Later' }),
  ];
  it('spent, allowance, top category, bills and small spends', () => {
    const w = weekSummary(cards, d(2026, 11, 25), 400);
    expect(w.spent).toBe(1250);
    expect(w.allowance).toBe(2800);
    expect(w.topCategory).toEqual({ name: 'Travel', total: 700 });
    expect(w.billsDue.map(b => b.title)).toEqual(['Late', 'Card']);
    expect(w.billsTotal).toBe(1300);
    expect(w.smallCount).toBe(1);
  });
  it('allowance never promises more than is left this cycle (plus spent this week)', () => {
    expect(weekSummary(cards, d(2026, 11, 25), 400, 1000).allowance).toBe(2250);
    expect(weekSummary(cards, d(2026, 11, 25), 400, 99999).allowance).toBe(2800);
    expect(weekSummary(cards, d(2026, 11, 25), 400, -50).allowance).toBe(1250);
  });
});

describe('payday', () => {
  it('salary day and the 2 days after', () => {
    expect(inPaydayWindow(25, d(2026, 11, 25))).toBe(true);
    expect(inPaydayWindow(25, d(2026, 11, 27))).toBe(true);
    expect(inPaydayWindow(25, d(2026, 11, 28))).toBe(false);
    expect(inPaydayWindow(25, d(2026, 11, 24))).toBe(false);
    expect(inPaydayWindow(31, d(2026, 12, 1))).toBe(true); // Nov 31 → Nov 30
  });
  it('leftover from the last cycle', () => {
    const cards = [
      newCard({ type: 'expense', amount: 30000, date: '2026-10-26' }),
      newCard({ type: 'expense', amount: 5000, date: '2026-11-25' }),
    ];
    expect(lastCycleLeftover(cards, 50000, 25, d(2026, 11, 25))).toBe(20000);
    expect(lastCycleLeftover(cards, 0, 25, d(2026, 11, 25))).toBeNull();
  });
  it('ticks are stored per month and parsed safely', () => {
    expect(paydayKey('2026-11-25')).toBe('hisaab.payday.2026-11');
    expect(parseTicks('["bills","nope","save"]')).toEqual(['bills', 'save']);
    expect(parseTicks('{bad')).toEqual([]);
    expect(parseTicks(null)).toEqual([]);
  });
});
