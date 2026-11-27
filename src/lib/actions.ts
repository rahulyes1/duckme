/** All writes go through here so undo, versions and links stay consistent. */
import { db, getSettings } from './db';
import type { Card, CardType, InvestKind, Version } from './types';
import { DEFAULT_COLOR, isActive } from './types';
import { addDaysISO, addMonthsISO, todayISO, uid } from './format';
import { isCardBill, nextDueDate, rankForNewCard } from './logic';
import { investKindFromText } from './capture';

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

/** Rank for a brand-new card: above every existing card, so your order is never shuffled. */
export async function nextRank(): Promise<number> {
  const all = await db.cards.toArray();
  return rankForNewCard(all.map(c => c.rank));
}

export async function createCard(partial: Partial<Card> & { type: CardType }): Promise<Card> {
  const c = newCard(partial);
  if (!partial.rank) c.rank = await nextRank();
  await db.cards.add(c);
  return c;
}

/** Runs `fn` and returns an undo that restores every card to its prior state. */
export async function withUndo(fn: () => Promise<void>): Promise<Undo> {
  const before = await db.cards.toArray();
  await fn();
  return async () => {
    // Restore without clear(): delete only cards created by `fn` (so the deletion is logged for
    // sync), and re-stamp restored cards so the undo wins over the cloud copy on every device.
    const keep = new Set(before.map(c => c.id));
    const now = Date.now();
    await db.transaction('rw', db.cards, db.deletions, async () => {
      const current = (await db.cards.toCollection().primaryKeys()) as string[];
      await db.cards.bulkDelete(current.filter(id => !keep.has(id)));
      await db.cards.bulkPut(before.map(c => ({ ...c, updatedAt: now })));
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

const nextDue = nextDueDate;

/**
 * Marks a bill paid (BUILD_SPEC §5): the bill becomes 'done', a linked expense is created, and if
 * the bill repeats a NEW bill card is created for the next due date, keeping the same rank so your
 * order doesn't change. Chain: bill → expense, bill → next bill.
 */
export interface PayOpts {
  /** What you actually paid, when it differs from the bill (a card bill paid in part, say). */
  amount?: number;
  /** Day you paid (YYYY-MM-DD). Defaults to today. */
  date?: string;
}

/**
 * The expense line paying a bill creates (pure, unit tested). A bill that is really an investment
 * (SIP, PPF, NPS…) is logged as one; a credit-card bill is a transfer: `cardPayment`, by net banking.
 */
export function billPaymentExpense(bill: Card, opts: PayOpts, today: string): Partial<Card> & { type: 'expense' } {
  const card = isCardBill(bill);
  const amount = opts.amount !== undefined && Number.isFinite(opts.amount) && opts.amount >= 0 ? opts.amount : bill.amount ?? 0;
  return {
    type: 'expense', title: `${bill.title} paid`, amount, date: opts.date || today,
    category: investKindFromText(bill.title) ? 'Investment' : bill.category ?? (bill.autorenew ? 'Entertainment' : 'Bills'),
    mode: card ? 'Net banking' : 'UPI', links: [bill.id],
    ...(card ? { cardPayment: true } : {}),
  };
}

/**
 * A credit-card bill is paid as a transfer: the expense is marked `cardPayment` (never a spend — the
 * card spends already counted) and paid by net banking.
 */
export async function payBill(id: string, opts: PayOpts = {}): Promise<{ undo: Undo; expense: Card; nextDue: string | null; nextBill: Card | null }> {
  let expense!: Card;
  let nd: string | null = null;
  let nextBill: Card | null = null;
  const undo = await withUndo(async () => {
    const bill = await db.cards.get(id);
    if (!bill) return;
    expense = newCard({ ...billPaymentExpense(bill, opts, todayISO()), rank: await nextRank() });
    await db.cards.add(expense);
    nd = bill.due ? nextDue(bill.due, bill.repeat) : null;
    const links = [...bill.links, expense.id];
    if (nd) {
      const now = Date.now();
      nextBill = {
        ...bill, id: uid(), due: nd, status: 'open', links: [bill.id], pinned: bill.pinned,
        createdAt: now, updatedAt: now, doneAt: undefined, trashedAt: undefined,
      };
      await db.cards.add(nextBill);
      links.push(nextBill.id);
    }
    await db.cards.update(id, { status: 'done', doneAt: Date.now(), links, pinned: false, updatedAt: Date.now() });
  });
  return { undo, expense, nextDue: nd, nextBill };
}

/* ---------- investments: logged, never "spent" ---------- */

export interface InvestLogInput { amount: number; date: string; title: string; kind: InvestKind; mode?: string }
export type InvestPlan = { update: string; patch: Partial<Card> } | { create: Partial<Card> & { type: 'invest' } };

const monthlyKind = (k: InvestKind | undefined) => k === 'SIP' || k === 'RD';
const normTitle = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/** The next instalment date after paying one: one month on from the current next date (or `from`). */
export const nextInstalment = (c: Pick<Card, 'invest'>, from: string): string => addMonthsISO(c.invest?.next ?? from, 1);

/**
 * Where a logged investment goes (pure): onto a live investment card of the same kind with the same
 * name (or the only live card of that kind) — invested goes up, a SIP/RD moves to next month — or a new card.
 */
export function planInvestLog(cards: Card[], input: InvestLogInput): InvestPlan {
  const same = cards.filter(c => c.type === 'invest' && isActive(c) && c.invest?.kind === input.kind);
  const name = normTitle(input.title);
  const hit = (name && same.find(c => normTitle(c.title) === name)) || (same.length === 1 ? same[0] : undefined);
  if (hit && hit.invest) {
    const inv = hit.invest;
    return {
      update: hit.id,
      patch: { invest: { ...inv, invested: (inv.invested ?? 0) + input.amount, ...(monthlyKind(inv.kind) ? { next: nextInstalment(hit, input.date) } : {}) } },
    };
  }
  return {
    create: {
      type: 'invest', title: input.title.trim() || input.kind, amount: input.amount,
      invest: { kind: input.kind, invested: input.amount, start: input.date, ...(monthlyKind(input.kind) ? { next: addMonthsISO(input.date, 1) } : {}) },
    },
  };
}

/** Adds the dated "money invested" line, linked both ways to its investment card. */
async function addInvestLine(investId: string, input: InvestLogInput): Promise<Card> {
  const line = newCard({
    type: 'expense', title: input.title.trim() || input.kind, amount: input.amount, date: input.date,
    category: 'Investment', mode: input.mode ?? 'UPI', links: [investId], rank: await nextRank(),
  });
  await db.cards.add(line);
  const inv = await db.cards.get(investId);
  if (inv) await db.cards.update(investId, { links: [...inv.links, line.id], updatedAt: Date.now() });
  return line;
}

/**
 * Logs money put into an investment (a SIP, MF, FD…): updates or creates the investment card and
 * keeps a dated "Investment" line so the cycle's cash flow still sees the money leave. Not a spend.
 */
export async function logInvestment(input: InvestLogInput): Promise<Undo> {
  return withUndo(async () => {
    const plan = planInvestLog(await db.cards.toArray(), input);
    let investId: string;
    if ('update' in plan) {
      await db.cards.update(plan.update, { ...plan.patch, updatedAt: Date.now() });
      investId = plan.update;
    } else {
      investId = (await createCard(plan.create)).id;
    }
    await addInvestLine(investId, input);
  });
}

export async function markDone(id: string): Promise<Undo> {
  return withUndo(async () => {
    const c = await db.cards.get(id);
    if (!c) return;
    if (c.type === 'bill') { await payBill(id); return; }
    if (c.type === 'invest' && c.invest && monthlyKind(c.invest.kind)) {
      // Done on a SIP/RD = this instalment is paid. The card stays; next moves a month on.
      const date = todayISO();
      const amount = c.amount ?? 0;
      await db.cards.update(id, {
        invest: { ...c.invest, invested: (c.invest.invested ?? 0) + amount, next: nextInstalment(c, date) },
        status: 'open', updatedAt: Date.now(),
      });
      if (amount > 0) await addInvestLine(id, { amount, date, title: c.title || c.invest.kind, kind: c.invest.kind });
      return;
    }
    if (c.type === 'task' && c.due && c.repeat && c.repeat !== 'none') {
      await db.cards.update(id, { due: nextDue(c.due, c.repeat)!, updatedAt: Date.now() });
      return;
    }
    const status = c.type === 'task' ? 'done' : 'archived';
    await db.cards.update(id, { status, doneAt: Date.now(), updatedAt: Date.now() });
  });
}

/**
 * Pushes the due date (or next SIP date) by `days` — 7 or 1 from Settings when not given — and
 * marks the card 'delayed'. It stays in the grid with a "Delayed" chip; its rank does not change.
 */
export async function delay(id: string, days?: number): Promise<{ undo: Undo; newDate: string | null }> {
  let newDate: string | null = null;
  const step = days ?? (await getSettings()).delayDays ?? 7;
  const undo = await withUndo(async () => {
    const c = await db.cards.get(id);
    if (!c) return;
    if (c.type === 'invest' && c.invest?.next) {
      newDate = addDaysISO(c.invest.next, step);
      await db.cards.update(id, { invest: { ...c.invest, next: newDate }, updatedAt: Date.now() });
    } else {
      newDate = addDaysISO(c.due ?? todayISO(), step);
      await db.cards.update(id, { due: newDate, status: 'delayed', updatedAt: Date.now() });
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
  const copy = { ...c, id: uid(), title: c.title ? `${c.title} (copy)` : '', links: [], pinned: false, rank: await nextRank(), createdAt: Date.now(), updatedAt: Date.now() };
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
  // bulkDelete (not clear) so every deletion is logged and also removed from the cloud copy.
  await db.transaction('rw', db.cards, db.versions, db.settings, db.deletions, async () => {
    const ids = (await db.cards.toCollection().primaryKeys()) as string[];
    await db.cards.bulkDelete(ids);
    await db.versions.clear();
    await db.settings.clear();
  });
}
