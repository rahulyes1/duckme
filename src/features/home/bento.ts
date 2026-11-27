import type { Card, TileSize } from '../../lib/types';

/** Your chosen size wins; otherwise the first pinned box is big, other pinned wide, long content tall. */
export function tileSize(c: Pick<Card, 'tile' | 'pinned' | 'body' | 'checklist' | 'images' | 'locked'>, isFirstPinned: boolean): TileSize {
  if (c.tile) return c.tile;
  if (isFirstPinned) return 'big';
  if (c.pinned) return 'wide';
  if (!c.locked && ((c.checklist?.length ?? 0) >= 3 || (c.body?.length ?? 0) > 70 || !!c.images?.length)) return 'tall';
  return 'small';
}
