import { fmtDate } from '../../lib/format';
import { describe, expect, it } from 'vitest';
import { lineAmount } from '../../lib/parse';
import type { Card } from '../../lib/types';
import { builtinTemplates, noteFromTemplate, templateFromNote, untick } from './templates';

describe('builtinTemplates', () => {
  const list = builtinTemplates(1, '2026-11-25');
  it('dates Month start lines relative to the next salary day', () => {
    const m = list.find(t => t.id === 'month')!;
    expect(m.title).toBe(`Month start · salary ${fmtDate('2026-12-01')}`);
    expect(m.items).toContain(`Rent ₹0 · by ${fmtDate('2026-12-06')}`);
  });
  it('puts the next ITR due date in the tax title', () => {
    expect(list.find(t => t.id === 'tax')!.title).toBe(`Tax season · ITR due ${fmtDate('2027-07-31')}`);
    expect(builtinTemplates(1, '2027-03-10').find(t => t.id === 'tax')!.title).toContain('31 Jul 2027');
  });
  it('placeholder lines never add stray amounts to the list total (dates are not read as ₹)', () => {
    for (const t of list) for (const i of t.items) expect([null, 0]).toContain(lineAmount(i));
  });
  it('uses graphite or mint only (no yellow, no blue/lavender)', () => {
    for (const t of list) expect(['white', 'mint']).toContain(t.color);
  });
});

describe('your templates', () => {
  it('saves an unticked, hidden copy and makes a clean note from it', () => {
    const t = templateFromNote({ title: ' ', body: '[x] a\n[ ] b', checklist: [{ id: '1', text: 'x', done: true }, { id: '2', text: ' ', done: false }], color: 'sky' });
    expect(t).toMatchObject({ title: 'My template', body: '[ ] a\n[ ] b', labels: ['Template'], status: 'archived' });
    expect(t.checklist).toHaveLength(1);
    expect(t.checklist![0]).toMatchObject({ text: 'x', done: false });
    expect(t.checklist![0].id).not.toBe('1');
    const n = noteFromTemplate({ ...t, id: 't', labels: ['Template', 'Ghar'] } as Card);
    expect(n.labels).toEqual(['Ghar']);
    expect(n).not.toHaveProperty('status');
    expect(untick('  [X] y')).toBe('  [ ] y');
  });
});
