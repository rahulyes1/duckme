import type { Card, Level } from '../../lib/types';
import { byRank } from '../../lib/logic';

export const LEVELS: { id: Level | undefined; label: string }[] = [
  { id: undefined, label: 'Normal' }, { id: 1, label: 'Important' }, { id: 2, label: 'Very important' }, { id: 3, label: 'Very very important' },
];
export const levelLabel = (l: Level): string => LEVELS.find(x => x.id === l)!.label;

/** Higher importance first; 0 means equal, so a second rule can decide. */
export const byLevel = (a: Pick<Card, 'level'>, b: Pick<Card, 'level'>): number => (b.level ?? 0) - (a.level ?? 0);

/** Pinned first, then importance, then your own order. */
export const topFirst = (a: Pick<Card, 'pinned' | 'level' | 'rank' | 'id'>, b: Pick<Card, 'pinned' | 'level' | 'rank' | 'id'>): number =>
  Number(b.pinned) - Number(a.pinned) || byLevel(a, b) || byRank(a, b);
