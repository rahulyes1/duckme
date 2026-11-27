import { describe, expect, it } from 'vitest';
import { ringArcs } from './ring';

describe('ringArcs', () => {
  it('splits the circle by share, leaving gaps', () => {
    const a = ringArcs([3, 1], 400, 20);
    expect(a.map(x => x.length)).toEqual([280, 80]);
    expect(a[1].offset).toBe(310);
  });
  it('draws one category as a full circle and nothing for no spends', () => {
    expect(ringArcs([5], 400, 20)[0].length).toBe(400);
    expect(ringArcs([0], 400, 20)[0].length).toBe(0);
  });
});
