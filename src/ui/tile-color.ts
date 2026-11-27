import type { Card, CardColor } from '../lib/types';
import { CARD_COLORS } from '../lib/types';

const PAINTS = CARD_COLORS.filter(c => c !== 'white');

/** Notes and tasks with no chosen colour get one picked from their id: random-looking, but it never changes. */
export function tileColor(c: Pick<Card, 'id' | 'type' | 'color'>): CardColor {
  if (c.color !== 'white' || (c.type !== 'note' && c.type !== 'task')) return c.color;
  let h = 0;
  for (let i = 0; i < c.id.length; i++) h = (h * 31 + c.id.charCodeAt(i)) >>> 0;
  return PAINTS[h % PAINTS.length];
}
