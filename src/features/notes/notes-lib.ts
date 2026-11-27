/** Small helpers used only by the Notes feature. */
import { db } from '../../lib/db';
import type { Undo } from '../../lib/actions';
import type { Card, CardType, ChecklistItem, Version } from '../../lib/types';
import { detectChips, parse, type SmartChip } from '../../lib/parse';
import { fmtDate, todayISO, uid } from '../../lib/format';

/** Reads an image file, scales it to fit `max` px and returns a JPEG data URL. */
export function resizeImage(file: File, max = 1280, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('No canvas')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

export async function readImages(files: FileList | null): Promise<string[]> {
  if (!files) return [];
  const out: string[] = [];
  for (const f of Array.from(files)) {
    if (!f.type.startsWith('image/')) continue;
    try { out.push(await resizeImage(f)); } catch { /* skip unreadable file */ }
  }
  return out;
}

/** "just now", "5 min ago", "2 h ago", "yesterday", "12 Nov". */
export function relTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  const d = new Date(ts), n = new Date(now);
  const sameDay = d.toDateString() === n.toDateString();
  if (sameDay) return `${h} h ago`;
  const y = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' });
}

const BULLET = /^\s*(?:[-*•]\s+|\[\s?\]\s*|\[[xX]\]\s*)/;

/** Body text → checklist items (one per non-empty line). "[x] milk" becomes a ticked item. */
export function textToItems(body: string): ChecklistItem[] {
  return body.split('\n').map(l => l.trimEnd()).filter(l => l.trim()).map(l => ({
    id: uid(),
    done: /^\s*\[[xX]\]/.test(l),
    text: l.replace(BULLET, '').trim(),
  }));
}

/** Checklist → body text, unticked first. Ticked items keep a "[x] " marker so converting back restores them. */
export function itemsToText(items: ChecklistItem[]): string {
  const open = items.filter(i => !i.done && i.text.trim()).map(i => i.text);
  const done = items.filter(i => i.done && i.text.trim()).map(i => `[x] ${i.text}`);
  return [...open, ...done].join('\n');
}

export const emptyItem = (): ChecklistItem => ({ id: uid(), text: '', done: false });

/** Permanently deletes cards (and their versions) but returns an undo that puts them back. */
export async function deleteForeverWithUndo(ids: string[]): Promise<Undo> {
  const cards = (await db.cards.bulkGet(ids)).filter((c): c is Card => !!c);
  const versions: Version[] = [];
  for (const id of ids) versions.push(...await db.versions.where('cardId').equals(id).toArray());
  await db.transaction('rw', db.cards, db.versions, async () => {
    await db.cards.bulkDelete(ids);
    for (const id of ids) await db.versions.where('cardId').equals(id).delete();
  });
  return async () => {
    await db.transaction('rw', db.cards, db.versions, async () => {
      await db.cards.bulkPut(cards);
      if (versions.length) await db.versions.bulkPut(versions);
    });
  };
}

export const chipTitle = (chip: SmartChip): string => {
  const t = parse(chip.match.replace(/,(?=\d{3})/g, '')).title.trim();
  return (t || chip.match).slice(0, 80);
};

/**
 * A checklist with several priced lines gets ONE "Add total ₹X as expense" chip instead of one per line.
 * With only one priced line the per-line chip stays. Bills/tasks and non-checklist chips are untouched.
 */
export function mergeChecklistChips(chips: SmartChip[], checklistLines: string[], noteTitle: string): SmartChip[] {
  const lines = new Set(checklistLines.map(l => l.trim()).filter(Boolean));
  const isItem = (c: SmartChip) => c.suggest === 'expense' && c.date === null && c.amount !== null && lines.has(c.match);
  const items = chips.filter(isItem);
  if (items.length < 2) return chips;
  const sum = Math.round(items.reduce((a, c) => a + (c.amount ?? 0), 0) * 100) / 100;
  const name = noteTitle.replace(/[\d₹]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Checklist';
  const merged: SmartChip = { match: `${name} total ${sum}`, amount: sum, date: null, suggest: 'expense', total: true };
  const out: SmartChip[] = [];
  let placed = false;
  for (const c of chips) {
    if (!isItem(c)) { out.push(c); continue; }
    if (!placed) { out.push(merged); placed = true; }
  }
  return out;
}

export const CHIP_ACTION: Record<SmartChip['suggest'], string> = {
  bill: 'Make bill', expense: 'Add expense', task: 'Make task',
};

export function chipLabel(chip: SmartChip, inr: (n: number) => string): string {
  const parts: string[] = [];
  if (chip.amount !== null) parts.push(inr(chip.amount));
  if (chip.date) parts.push(fmtDate(chip.date));
  return parts.join(' · ');
}

/** Builds the partial card a smart chip spawns. */
export function chipCard(chip: SmartChip): Partial<Card> & { type: CardType } {
  const p = parse(chip.match.replace(/,(?=\d{3})/g, ''));
  const title = chipTitle(chip);
  if (chip.suggest === 'bill') {
    return {
      type: 'bill', title, amount: chip.amount ?? undefined, due: chip.date ?? undefined,
      repeat: p.repeat, category: p.category === 'Other' ? 'Bills' : p.category,
    };
  }
  if (chip.suggest === 'expense') {
    return { type: 'expense', title, amount: chip.amount ?? 0, date: todayISO(), category: p.category, mode: 'UPI' };
  }
  return { type: 'task', title, due: chip.date ?? undefined, horizon: 'week' };
}

/** Amount/date fill for convert(), taken from the note's text. Only defined keys are set. */
export function convertFill(text: string, type: CardType): Partial<Card> {
  const chips = detectChips(text);
  const flat = text.replace(/\n/g, ' ').replace(/,(?=\d{3})/g, '');
  const p = parse(flat);
  const amount = chips.find(c => c.amount !== null)?.amount ?? p.amount;
  const date = chips.find(c => c.date)?.date ?? p.date;
  const fill: Partial<Card> = {};
  if (type === 'bill') {
    if (amount != null) fill.amount = amount;
    if (date) fill.due = date;
    if (p.repeat === 'monthly') fill.repeat = 'monthly';
    if (p.category !== 'Other') fill.category = p.category;
  } else if (type === 'expense') {
    if (amount != null) fill.amount = amount;
    if (date && date <= todayISO()) fill.date = date;
    if (p.category !== 'Other') fill.category = p.category;
  } else if (type === 'task') {
    if (date) fill.due = date;
  }
  return fill;
}

/** localStorage that never throws. */
export const pref = {
  get(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, v: string) {
    try { localStorage.setItem(key, v); } catch { /* storage blocked */ }
  },
};
