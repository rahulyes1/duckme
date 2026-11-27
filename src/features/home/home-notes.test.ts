import { describe, expect, it } from 'vitest';
import { newCard } from '../../lib/actions';
import { homeNotes } from './home-notes';

describe('home notes', () => {
  const note = (title: string, updatedAt: number, extra = {}) => ({ ...newCard({ type: 'note', title, ...extra }), updatedAt });
  it('keeps pinned apart and lists the four latest other notes', () => {
    const cards = [note('a', 1), note('b', 5), note('c', 3), note('d', 4), note('e', 2),
      note('pin', 0, { pinned: true }), note('gone', 9, { status: 'trashed' }), { ...newCard({ type: 'task', title: 'task' }), updatedAt: 10 }];
    const { pinned, recent } = homeNotes(cards);
    expect(pinned.map(c => c.title)).toEqual(['pin']);
    expect(recent.map(c => c.title)).toEqual(['b', 'd', 'c', 'e']);
  });
});
