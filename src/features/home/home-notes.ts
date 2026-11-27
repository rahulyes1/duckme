/** What the Home tab shows: everything pinned, then the four notes you touched last. Pure. */
import type { Card } from '../../lib/types';
import { isActive } from '../../lib/types';
import { topFirst } from '../notes/importance';

export function homeNotes(cards: Card[]): { pinned: Card[]; recent: Card[] } {
  const live = cards.filter(c => (c.type === 'note' || c.type === 'task') && isActive(c) && !c.journalDate);
  return {
    pinned: live.filter(c => c.pinned).sort(topFirst),
    recent: live.filter(c => c.type === 'note' && !c.pinned).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4),
  };
}
