/** Daily journal ("Today page") — pure helpers. The database part lives in journal-store.ts. */
import type { Card, ChecklistItem } from '../../lib/types';
import { addDaysISO, fmtDate, fromISO, uid } from '../../lib/format';
import { openTodos } from './md-lite';

export const JOURNAL_LABEL = 'Journal';
/** Checklist items copied from an earlier day carry this id prefix; the checklist shows a "Carried over" marker above them. */
export const CARRY_PREFIX = 'carry-';
export const isCarried = (i: ChecklistItem) => i.id.startsWith(CARRY_PREFIX);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekdayName = (iso: string) => WEEKDAYS[fromISO(iso).getDay()];
export const weekdayShort = (iso: string) => weekdayName(iso).slice(0, 3);

export function journalTitle(iso: string, todayIso: string): string {
  return `${iso === todayIso ? 'Today' : 'Journal'} · ${fmtDate(iso)}`;
}

/** Monday..Sunday of the week that contains `iso`. */
export function weekOf(iso: string): string[] {
  const dow = (fromISO(iso).getDay() + 6) % 7; // Mon = 0
  const mon = addDaysISO(iso, -dow);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(mon, i));
}

const live = (c: Card) => c.status !== 'trashed' && !!c.journalDate;

/** The journal note for a date (newest if, somehow, there are two). */
export function journalFor(cards: Card[], iso: string): Card | undefined {
  return cards.filter(c => live(c) && c.journalDate === iso).sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

/** The most recent journal strictly before `iso`. */
export function latestJournalBefore(cards: Card[], iso: string): Card | undefined {
  return cards.filter(c => live(c) && c.journalDate! < iso)
    .sort((a, b) => (a.journalDate! < b.journalDate! ? 1 : a.journalDate! > b.journalDate! ? -1 : b.updatedAt - a.updatedAt))[0];
}

/**
 * Unticked items from an earlier journal, as fresh checklist items (new ids, so the old note is untouched).
 * Takes both checklist items and "[ ] item" lines from the body. Empty and duplicate texts are skipped.
 */
export function carryItems(prev: Card | undefined): ChecklistItem[] {
  if (!prev) return [];
  const texts = [
    ...(prev.checklist ?? []).filter(i => !i.done).map(i => i.text.trim()),
    ...openTodos(prev.body ?? ''),
  ].filter(Boolean);
  const seen = new Set<string>();
  const out: ChecklistItem[] = [];
  for (const t of texts) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: CARRY_PREFIX + uid(), text: t, done: false });
  }
  return out;
}

/** The partial card for a new journal note. */
export function newJournal(iso: string, todayIso: string, prev?: Card): Partial<Card> & { type: 'note' } {
  const carried = iso === todayIso ? carryItems(prev) : [];
  return {
    type: 'note',
    journalDate: iso,
    title: journalTitle(iso, todayIso),
    labels: [JOURNAL_LABEL],
    color: 'white',
    ...(carried.length ? { checklist: carried } : {}),
  };
}

/** First readable line of a journal for the Today banner preview. */
export function journalPreview(c: Card | undefined): string {
  if (!c) return '';
  const line = (c.body ?? '').split('\n').map(l => l.replace(/^\s*(#{1,2}\s+|[-*•]\s+|\[[ xX]?\]\s?)/, '').replace(/\*\*/g, '').trim())
    .find(l => l && !/^[-_*]{3,}$/.test(l));
  if (line) return line;
  const open = (c.checklist ?? []).filter(i => !i.done && i.text.trim());
  return open.length ? `${open.length} to do: ${open.slice(0, 2).map(i => i.text).join(', ')}` : '';
}
