import { describe, expect, it } from 'vitest';
import { tileSize } from './bento';
import { tileColor } from '../../ui/tile-color';

const base = { pinned: false, body: '', checklist: undefined, images: undefined, locked: false, tile: undefined };
describe('bento', () => {
  it('sizes from pin and content, and your choice wins', () => {
    expect(tileSize(base, false)).toBe('small');
    expect(tileSize({ ...base, pinned: true }, true)).toBe('big');
    expect(tileSize({ ...base, pinned: true }, false)).toBe('wide');
    expect(tileSize({ ...base, body: 'x'.repeat(90) }, false)).toBe('tall');
    expect(tileSize({ ...base, pinned: true, tile: 'small' }, true)).toBe('small');
  });
  it('gives an uncoloured note a fixed colour and keeps a chosen one', () => {
    const c = { id: 'abc123', type: 'note' as const, color: 'white' as const };
    expect(tileColor(c)).toBe(tileColor(c));
    expect(tileColor(c)).not.toBe('white');
    expect(tileColor({ ...c, color: 'mint' })).toBe('mint');
    expect(tileColor({ ...c, type: 'expense' })).toBe('white');
  });
});
