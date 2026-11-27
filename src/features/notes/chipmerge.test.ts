import { describe, expect, it } from 'vitest';
import { detectChips } from '../../lib/parse';
import { chipCard, mergeChecklistChips } from './notes-lib';

describe('mergeChecklistChips', () => {
  const lines = ['Milk 60', 'Bread 45', 'Eggs 90'];
  const chips = detectChips(lines.join('\n'));
  it('gives one total chip for several priced lines', () => {
    const m = mergeChecklistChips(chips, lines, 'Grocery list');
    expect(m).toHaveLength(1);
    expect(m[0].total).toBe(true);
    expect(m[0].amount).toBe(195);
    expect(chipCard(m[0])).toMatchObject({ type: 'expense', amount: 195 });
  });
  it('keeps the per-line chip when only one line has an amount', () => {
    const l = ['Milk 60', 'Bread', 'Eggs'];
    const c = detectChips(l.join('\n'));
    expect(mergeChecklistChips(c, l, 'List')).toEqual(c);
  });
  it('leaves non-checklist chips alone', () => {
    const c = detectChips('Pay plumber 1500 on 12th\n' + lines.join('\n'));
    const m = mergeChecklistChips(c, lines, 'x');
    expect(m).toHaveLength(2);
    expect(m[0].suggest).toBe('bill');
  });
});
