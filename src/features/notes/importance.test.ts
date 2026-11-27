import { describe, expect, it } from 'vitest';
import type { Card } from '../../lib/types';
import { newCard } from '../../lib/actions';
import { todayPriorities } from '../home/priorities';
import { topFirst } from './importance';

const c = (title: string, p: Partial<Card>) => newCard({ type: 'task', title, id: title, ...p });
describe('importance', () => {
  it('puts pinned first, then the more important, then your order', () => {
    const list = [c('plain', { rank: 1 }), c('imp', { rank: 2, level: 1 }), c('vvi', { rank: 3, level: 3 }), c('pin', { rank: 4, pinned: true })];
    expect(list.sort(topFirst).map(x => x.title)).toEqual(['pin', 'vvi', 'imp', 'plain']);
  });
  it("lifts important tasks to the top of today's priorities, even without a date", () => {
    const cards = [c('due', { rank: 1, due: '2026-11-27' }), c('vi', { rank: 2, level: 2 }), c('vvi', { rank: 3, level: 3 })];
    expect(todayPriorities(cards, new Date(2026, 10, 27)).items.map(x => x.title)).toEqual(['vvi', 'vi', 'due']);
  });
});
