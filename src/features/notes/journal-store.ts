/** Finds or creates the journal note for a date. Guarded so a double tap never makes two notes. */
import { db } from '../../lib/db';
import { createCard } from '../../lib/actions';
import type { Card } from '../../lib/types';
import { todayISO } from '../../lib/format';
import { journalFor, latestJournalBefore, newJournal } from './journal';

const inFlight = new Map<string, Promise<Card>>();

export function ensureJournal(iso: string): Promise<Card> {
  const running = inFlight.get(iso);
  if (running) return running;
  const p = (async () => {
    const all = await db.cards.where('journalDate').belowOrEqual(iso).toArray();
    const found = journalFor(all, iso);
    if (found) return found;
    const today = todayISO();
    return createCard(newJournal(iso, today, latestJournalBefore(all, iso)));
  })().finally(() => { inFlight.delete(iso); });
  inFlight.set(iso, p);
  return p;
}
