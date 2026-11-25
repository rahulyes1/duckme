import { describe, expect, it } from 'vitest';
import type { Card } from '../../lib/types';
import {
  CARRY_PREFIX, carryItems, journalFor, journalPreview, journalTitle, latestJournalBefore, newJournal, weekOf,
} from './journal';

const card = (p: Partial<Card>): Card => ({
  id: Math.random().toString(36).slice(2), type: 'note', title: '', body: '', color: 'white', pinned: false, labels: [],
  horizon: 'none', rank: 0, status: 'open', links: [], createdAt: 0, updatedAt: 0, ...p,
});

describe('journal dates', () => {
  it('weekOf gives Monday..Sunday', () => {
    expect(weekOf('2026-11-25')).toEqual([
      '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29',
    ]);
    expect(weekOf('2026-11-29')[0]).toBe('2026-11-23'); // Sunday belongs to the week that started Monday
    expect(weekOf('2026-11-23')[6]).toBe('2026-11-29');
  });
  it('titles use DD-MM-YYYY', () => {
    expect(journalTitle('2026-11-25', '2026-11-25')).toBe('Today · 25-11-2026');
    expect(journalTitle('2026-11-20', '2026-11-25')).toBe('Journal · 20-11-2026');
  });
});

describe('finding journals', () => {
  const cards = [
    card({ id: 'a', journalDate: '2026-11-20' }),
    card({ id: 'b', journalDate: '2026-11-23' }),
    card({ id: 't', journalDate: '2026-11-24', status: 'trashed' }),
    card({ id: 'n' }),
  ];
  it('journalFor ignores trashed notes', () => {
    expect(journalFor(cards, '2026-11-23')?.id).toBe('b');
    expect(journalFor(cards, '2026-11-24')).toBeUndefined();
  });
  it('latestJournalBefore skips gaps and trash', () => {
    expect(latestJournalBefore(cards, '2026-11-25')?.id).toBe('b');
    expect(latestJournalBefore(cards, '2026-11-23')?.id).toBe('a');
    expect(latestJournalBefore(cards, '2026-11-20')).toBeUndefined();
  });
});

describe('carry over', () => {
  const prev = card({
    journalDate: '2026-11-24',
    checklist: [
      { id: '1', text: 'Pay bijli', done: false },
      { id: '2', text: 'Gym', done: true },
      { id: '3', text: '  ', done: false },
    ],
    body: 'Long day\n[ ] Call amma\n[x] Groceries\n[ ] pay bijli',
  });
  it('takes unticked checklist items and body checkboxes, deduped, with new ids', () => {
    const items = carryItems(prev);
    expect(items.map(i => i.text)).toEqual(['Pay bijli', 'Call amma']);
    expect(items.every(i => !i.done && i.id.startsWith(CARRY_PREFIX))).toBe(true);
    expect(items.some(i => i.id === '1')).toBe(false);
  });
  it('leaves the old note untouched', () => {
    const before = JSON.stringify(prev);
    carryItems(prev);
    expect(JSON.stringify(prev)).toBe(before);
  });
  it('newJournal for today carries items; a past day does not', () => {
    const t = newJournal('2026-11-25', '2026-11-25', prev);
    expect(t).toMatchObject({ type: 'note', journalDate: '2026-11-25', title: 'Today · 25-11-2026', labels: ['Journal'] });
    expect(t.checklist?.length).toBe(2);
    expect(newJournal('2026-11-22', '2026-11-25', prev).checklist).toBeUndefined();
    expect(newJournal('2026-11-25', '2026-11-25', undefined).checklist).toBeUndefined();
  });
});

describe('journalPreview', () => {
  it('shows the first written line without markup', () => {
    expect(journalPreview(card({ body: '\n---\n# **Good** day\nmore' }))).toBe('Good day');
  });
  it('falls back to open items', () => {
    expect(journalPreview(card({ checklist: [{ id: 'x', text: 'Milk', done: false }] }))).toBe('1 to do: Milk');
  });
});
