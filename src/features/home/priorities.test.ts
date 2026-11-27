import { describe, expect, it } from 'vitest';
import type { Card } from '../../lib/types';
import { newCard } from '../../lib/actions';
import { todayPriorities } from './priorities';

const REF = new Date(2026, 10, 27);
let n = 0;
const mk = (p: Partial<Card> & { type: Card['type'] }): Card => newCard({ id: `c${++n}`, rank: n, ...p });
const titles = (cards: Card[], max?: number) => todayPriorities(cards, REF, max).items.map(c => c.title);

describe('todayPriorities', () => {
  it('Do now, then bills due within 3 days, then planned for today — your order inside each', () => {
    const cards = [
      mk({ type: 'task', title: 'today task', when: { unit: 'day', start: '2026-11-27' }, rank: 1 }),
      mk({ type: 'bill', title: 'bill in 3 days', due: '2026-11-30', rank: 2 }),
      mk({ type: 'task', title: 'do 2', quadrant: 'do', rank: 5 }),
      mk({ type: 'task', title: 'do 1', quadrant: 'do', rank: 3 }),
      mk({ type: 'bill', title: 'overdue bill', due: '2026-11-20', rank: 4 }),
      mk({ type: 'task', title: 'due yesterday', due: '2026-11-26', rank: 6 }),
    ];
    expect(titles(cards)).toEqual(['do 1', 'do 2', 'bill in 3 days', 'overdue bill', 'today task']);
    expect(todayPriorities(cards, REF).more).toBe(1);
  });
  it('no duplicates when a card fits more than one group', () => {
    const cards = [mk({ type: 'bill', title: 'urgent bill', quadrant: 'do', due: '2026-11-27', when: { unit: 'day', start: '2026-11-27' } })];
    expect(titles(cards)).toEqual(['urgent bill']);
  });
  it('leaves out later tasks, far bills, other weeks, expenses, investments, journal pages and finished cards', () => {
    const cards = [
      mk({ type: 'task', title: 'later', quadrant: 'later', due: '2026-11-27' }),
      mk({ type: 'bill', title: 'later bill due soon', quadrant: 'later', due: '2026-11-28' }),
      mk({ type: 'bill', title: 'far bill', due: '2026-12-01' }),
      mk({ type: 'task', title: 'this week', when: { unit: 'week', start: '2026-11-23' } }),
      mk({ type: 'task', title: 'tomorrow', when: { unit: 'day', start: '2026-11-28' } }),
      mk({ type: 'expense', title: 'lunch', quadrant: 'do', date: '2026-11-27' }),
      mk({ type: 'invest', title: 'sip', quadrant: 'do' }),
      mk({ type: 'note', title: 'journal', journalDate: '2026-11-27', when: { unit: 'day', start: '2026-11-27' } }),
      mk({ type: 'task', title: 'done', quadrant: 'do', status: 'done' }),
      mk({ type: 'task', title: 'trashed', quadrant: 'do', status: 'trashed' }),
      mk({ type: 'note', title: 'note planned', when: { unit: 'day', start: '2026-11-26' } }),
      mk({ type: 'task', title: 'delayed do', quadrant: 'do', status: 'delayed' }),
    ];
    expect(titles(cards)).toEqual(['delayed do', 'later bill due soon', 'note planned']);
  });
  it('caps at max and reports the rest', () => {
    const cards = Array.from({ length: 8 }, (_, i) => mk({ type: 'task', title: `t${i}`, quadrant: 'do', rank: i }));
    const p = todayPriorities(cards, REF, 3);
    expect(p.items.map(c => c.title)).toEqual(['t0', 't1', 't2']);
    expect(p.more).toBe(5);
    expect(todayPriorities([], REF)).toEqual({ items: [], more: 0 });
  });
});
