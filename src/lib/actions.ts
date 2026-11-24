/** All writes go through here so undo, versions and links stay consistent. */
import { db, getSettings } from './db';
import type { Card, CardType, Version } from './types';
import { DEFAULT_COLOR } from './types';
import { addDaysISO, addMonthsISO, todayISO, uid } from './format';

export type Undo = () => Promise<void>;

export function newCard(partial: Partial<Card> & { type: CardType }): Card {
  const now = Date.now();
  return {
    id: uid(),
    title: '',
    body: '',
    color: DEFAULT_COLOR[partial.type],
    pinned: false,
    labels: [],
    horizon: 'none',
    rank: 0,
    status: 'open',
    links: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export async function nextRank(): Promise<number> {
  const all = await db.cards.toArray();
  return all.reduce((m, c) => Math.max(m, c.rank || 0), 0) + 1;
}

export async function createCard(partial: Partial<Card> & { type: CardType }): Promise<Card> {
  const c = newCard(partial);
  if ((c.type === 'task' || c.type === 'bill') && !c.rank) c.rank = await nextRank();
  await db.cards.add(c);
  return c;
}

/** Runs `fn` and returns an undo that restores every card to its prior state. */
export async function withUndo(fn: () => Promise<void>): Promise<Undo> {
  const before = await db.cards.toArray();
  await fn();
  return async () => {
    await db.transaction('rw', db.cards, async () => {
      await db.cards.clear();
      await db.cards.bulkPut(before);
    });
  };
}

const VERSION_GAP_MS = 2 * 60 * 1000;

/** Saves a version snapshot of the card's text if the last one is older than 2 minutes. */
async function maybeSnapshot(prev: Card) {
  if (prev.type !== 'note' && prev.type !== 'task') return;
  const last = await db.versions.where('cardId').equals(prev.id).last();
  if (last && Date.now() - last.at < VERSION_GAP_MS) return;
  if (last && last.title === prev.title && last.body === prev.body &&
      JSON.stringify(last.checklist ?? null) === JSON.stringify(prev.checklist ?? null)) return;
  if (!prev.title && !prev.body && !prev.checklist?.length) return;
  const v: Version = { cardId: prev.id, at: Date.now(), title: prev.title, body: prev.body, checklist: prev.checklist };
  await db.versions.add(v);
}

export async function updateCard(id: string, patch: Partial<Card>): Promise<void> {
  const prev = await db.cards.get(id);
  if (!prev) return;
  if ('title' in patch || 'body' in patch || 'checklist' in patch) await maybeSnapshot(prev);
  await db.cards.update(id, { ...patch, updatedAt: Date.now() });
}

export async function getVersions(cardId: string): Promise<Version[]> {
  return (await db.versions.where('cardId').equals(cardId).sortBy('at')).reverse();
}

export async function restoreVersion(cardId: string, v: Version): Promise<void> {
  await updateCard(cardId, { title: v.title, body: v.body, checklist: v.checklist });
}

const nextDue = (due: string, repeat: Card['repeat']): string | null => {
  if (repeat === 'monthly') return addMonthsISO(due, 1);
  if (repeat === 'quarterly') return addMonthsISO(due, 3);
  if (repeat === 'yearly') return addMonthsISO(due, 12);
  return null;
};

/**
 * Marks a bill paid: creates a linked expense card. Repeating bills roll to the next due date;
 * one-off bills become 'done'.
 */
export async function payBill(id: string): Promise<{ undo: Undo; expense: Card; nextDue: string | null }> {
  let expense!: Card;
  let nd: string | null = null;
  const undo = await withUndo(async () => {
    const bill = await db.cards.get(id);
    if (!bill) return;
    expense = newCard({
      type: 'expense', title: `${bill.title} paid`, amount: bill.amount ?? 0, date: todayISO(),
      category: bill.category ?? (bill.autorenew ? 'Entertainment' : 'Bills'), mode: 'UPI', links: [bill.id],
    });
    await db.cards.add(expense);
    nd = bill.due ? nextDue(bill.due, bill.repeat) : null;
    const links = [...bill.links, expense.id];
    if (nd) await db.cards.update(id, { due: nd, links, updatedAt: Date.now() });
    else await db.cards.update(id, { status: 'done', doneAt: Date.now(), links, updatedAt: Date.now() });
  });
  return { undo, expense, nextDue: nd };
}

export async function markDone(id: string): Promise<Undo> {
  return withUndo(async () => {
    const c = await db.cards.get(id);
    if (!c) return;
    if (c.type === 'bill') { await payBill(id); return; }
    if (c.type === 'task' && c.due && c.repeat && c.repeat !== 'none') {
      await db.cards.update(id, { due: nextDue(c.due, c.repeat)!, updatedAt: Date.now() });
      return;
    }
    const status = c.type === 'task' ? 'done' : 'archived';
    await db.cards.update(id, { status, doneAt: Date.now(), updatedAt: Date.now() });
  });
}

/** Pushes the due date (or next SIP date) by `days`. */
export async function delay(id: string, days = 7): Promise<{ undo: Undo; newDate: string | null }> {
  let newDate: string | null = null;
  const undo = await withUndo(async () => {
    const c = await db.cards.get(id);
    if (!c) return;
    if (c.type === 'invest' && c.invest?.next) {
      newDate = addDaysISO(c.invest.next, days);
      await db.cards.update(id, { invest: { ...c.invest, next: newDate }, updatedAt: Date.now() });
    } else {
      newDate = addDaysISO(c.due ?? todayISO(), days);
      await db.cards.update(id, { due: newDate, updatedAt: Date.now() });
    }
  });
  return { undo, newDate };
}

export const setStatus = (id: string, status: Card['status']) =>
  withUndo(async () => {
    await db.cards.update(id, {
      status, updatedAt: Date.now(),
      trashedAt: status === 'trashed' ? Date.now() : undefined,
    });
  });

export const kill = (id: string) => setStatus(id, 'killed');
export const archive = (id: string) => setStatus(id, 'archived');
export const trash = (id: string) => setStatus(id, 'trashed');
export const restore = (id: string) => setStatus(id, 'open');

export async function deleteForever(id: string): Promise<void> {
  await db.cards.delete(id);
  await db.versions.where('cardId').equals(id).delete();
}

export async function duplicate(id: string): Promise<Card | null> {
  const c = await db.cards.get(id);
  if (!c) return null;
  const copy = { ...c, id: uid(), title: c.title ? `${c.title} (copy)` : '', links: [], pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
  await db.cards.add(copy);
  return copy;
}

/** Converts a card to another type, filling sensible defaults. Links the history. */
export async function convert(id: string, type: CardType, fill: Partial<Card> = {}): Promise<Undo> {
  return withUndo(async () => {
    const c = await db.cards.get(id);
    if (!c) return;
    const patch: Partial<Card> = { type, ...fill, updatedAt: Date.now() };
    if (type === 'bill') {
      patch.due = fill.due ?? c.due ?? addDaysISO(todayISO(), 7);
      patch.repeat = fill.repeat ?? c.repeat ?? 'none';
      if (c.color === 'haldi') patch.color = 'rose';
    }
    if (type === 'expense') { patch.date = fill.date ?? todayISO(); patch.mode = c.mode ?? 'UPI'; patch.category = fill.category ?? c.category ?? 'Other'; }
    if (type === 'task' && c.horizon === 'none') patch.horizon = 'week';
    if ((type === 'task' || type === 'bill') && !c.rank) patch.rank = await nextRank();
    await db.cards.update(id, patch);
  });
}

/** Creates a new linked card from a note (smart chip action). Keeps the note as it is. */
export async function spawnFromNote(noteId: string, partial: Partial<Card> & { type: CardType }): Promise<Card> {
  const created = await createCard({ ...partial, links: [noteId] });
  const note = await db.cards.get(noteId);
  if (note) await db.cards.update(noteId, { links: [...note.links, created.id] });
  return created;
}

/** Reorders tasks/bills: ids in the new order get ranks 1..n relative to their old minimum. */
export async function applyOrder(ids: string[]): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    for (let i = 0; i < ids.length; i++) await db.cards.update(ids[i], { rank: i + 1 });
  });
}

export async function purgeOldTrash(): Promise<number> {
  const cutoff = Date.now() - 30 * 864e5;
  const old = await db.cards.where('status').equals('trashed').filter(c => (c.trashedAt ?? 0) < cutoff).toArray();
  for (const c of old) await deleteForever(c.id);
  return old.length;
}

export async function exportAll(): Promise<string> {
  const [cards, versions, settings] = await Promise.all([db.cards.toArray(), db.versions.toArray(), getSettings()]);
  const { pinHash: _omit, ...safeSettings } = settings;
  return JSON.stringify({ app: 'hisaab', version: 1, exportedAt: new Date().toISOString(), cards, versions, settings: safeSettings }, null, 2);
}

export async function deleteEverything(): Promise<void> {
  await db.transaction('rw', db.cards, db.versions, db.settings, async () => {
    await db.cards.clear();
    await db.versions.clear();
    await db.settings.clear();
  });
}
