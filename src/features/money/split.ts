/**
 * Flatmate / friend split rules. Pure: no database, no UI. Unit tested in split.test.ts.
 *
 * Model (Card.split):
 * - `people` lists everyone in the split EXCEPT me, with their share in ₹.
 * - My share is whatever is left: amount − sum(people shares).
 * - paidBy 'me': each unsettled person owes me their share.
 * - paidBy '<name>': I owe that person my share, unless their entry is marked settled
 *   (their entry's `settled` flag stands for "settled between me and them").
 * Money never moves here — only who owes whom.
 */
import type { Card, SplitInfo, SplitPerson } from '../../lib/types';
import { fmtDate, inr } from '../../lib/format';
import { isLive } from './money-util';

export const ME = 'me';

const toPaise = (n: number): number => Math.round((n || 0) * 100);
const fromPaise = (p: number): number => p / 100;

/** Same name, ignoring case and extra spaces. */
export const sameName = (a: string, b: string): boolean =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

export const cleanName = (s: string): string => s.trim().replace(/\s+/g, ' ');

/**
 * Splits `amount` equally between me and `names`, in paise, so the parts add up exactly.
 * Leftover paise go to the friends first (in order), then to me.
 */
export function equalShares(amount: number, names: string[]): { me: number; people: { name: string; share: number }[] } {
  const total = toPaise(amount);
  const n = names.length + 1;
  const base = Math.floor(total / n);
  let rem = total - base * n;
  const people = names.map(name => {
    const extra = rem > 0 ? 1 : 0;
    rem -= extra;
    return { name, share: fromPaise(base + extra) };
  });
  return { me: fromPaise(base + rem), people };
}

/** My share of a split expense (amount − everyone else's share), rounded to paise, never negative. */
export function myShare(amount: number, split: SplitInfo): number {
  const rest = split.people.reduce((s, p) => s + toPaise(p.share), 0);
  return fromPaise(Math.max(0, toPaise(amount) - rest));
}

/** Checks typed shares. Returns an error message, or null when they fit inside the amount. */
export function validateShares(amount: number, shares: number[]): string | null {
  if (shares.some(s => !Number.isFinite(s) || s < 0)) return 'Shares must be 0 or more';
  const total = toPaise(amount);
  const sum = shares.reduce((s, x) => s + toPaise(x), 0);
  if (sum > total) return `Shares add up to ${inr(fromPaise(sum))}, more than ${inr(amount)}`;
  return null;
}

export interface SplitDraft {
  people: string[];
  /** Typed shares by name; missing = use the equal share. Null = equal split. */
  custom: Record<string, number> | null;
  /** 'me' or one of `people`. */
  paidBy: string;
}

/** Builds the SplitInfo saved on the expense, or an error to show next to the split editor. */
export function buildSplit(amount: number, d: SplitDraft): { split?: SplitInfo; error?: string } {
  const names = d.people.map(cleanName).filter(Boolean);
  if (!names.length) return { error: 'Pick at least one person to split with' };
  if (amount <= 0) return { error: 'Type an amount first' };
  const eq = equalShares(amount, names);
  const people: SplitPerson[] = eq.people.map(p => ({
    name: p.name,
    share: d.custom && d.custom[p.name] !== undefined ? fromPaise(toPaise(d.custom[p.name])) : p.share,
    settled: false,
  }));
  const err = validateShares(amount, people.map(p => p.share));
  if (err) return { error: err };
  const paidBy = d.paidBy !== ME && names.some(n => sameName(n, d.paidBy)) ? names.find(n => sameName(n, d.paidBy))! : ME;
  return { split: { paidBy, people } };
}

/* ---------- balances ---------- */

export interface SplitItem {
  card: Card;
  /** Signed ₹: positive = they owe me, negative = I owe them. */
  amount: number;
  settled: boolean;
}

export interface Balance {
  name: string;
  /** Positive = they owe me, negative = I owe them. Unsettled items only. */
  net: number;
  open: SplitItem[];
  settled: SplitItem[];
}

const isSplitExpense = (c: Card): boolean => c.type === 'expense' && isLive(c) && !!c.split && c.split.people.length > 0;

/** What one split expense means between me and `person` (null when they're not involved with me). */
export function itemFor(c: Card, person: SplitPerson): SplitItem | null {
  const s = c.split!;
  if (s.paidBy === ME) return { card: c, amount: person.share, settled: person.settled };
  if (sameName(s.paidBy, person.name)) return { card: c, amount: -myShare(c.amount ?? 0, s), settled: person.settled };
  return null; // someone else paid; this person owes them, not me
}

/** Net balance with each person, biggest first. People with nothing open are listed last. */
export function splitBalances(cards: Card[]): Balance[] {
  const map = new Map<string, Balance>();
  for (const c of cards) {
    if (!isSplitExpense(c)) continue;
    for (const p of c.split!.people) {
      const it = itemFor(c, p);
      if (!it || it.amount === 0) continue;
      const key = cleanName(p.name).toLowerCase();
      const b = map.get(key) ?? { name: cleanName(p.name), net: 0, open: [], settled: [] };
      if (it.settled) b.settled.push(it);
      else { b.open.push(it); b.net = fromPaise(toPaise(b.net) + toPaise(it.amount)); }
      map.set(key, b);
    }
  }
  const byDate = (a: SplitItem, b: SplitItem) => ((b.card.date ?? '') < (a.card.date ?? '') ? -1 : (b.card.date ?? '') > (a.card.date ?? '') ? 1 : 0);
  const out = [...map.values()];
  for (const b of out) { b.open.sort(byDate); b.settled.sort(byDate); }
  return out.sort((a, b) => (b.open.length ? 1 : 0) - (a.open.length ? 1 : 0) || Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name));
}

/** The split with `name`'s entry marked settled (or unsettled). Other people are untouched. */
export function settleSplit(split: SplitInfo, name: string, settled = true): SplitInfo {
  return { ...split, people: split.people.map(p => (sameName(p.name, name) ? { ...p, settled } : p)) };
}

/** Friendly one-liner: "Rohan owes you ₹1,240" / "You owe Priya ₹300" / "All settled with Asha". */
export function balanceText(b: Pick<Balance, 'name' | 'net'>): string {
  if (b.net > 0) return `${b.name} owes you ${inr(b.net)}`;
  if (b.net < 0) return `You owe ${b.name} ${inr(-b.net)}`;
  return `All settled with ${b.name}`;
}

/* ---------- settle-up links (links only, never moves money) ---------- */

const money2 = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

/** UPI deep link the friend taps to pay me. Every value is URL-encoded. */
export function upiLink(upiId: string, upiName: string | undefined, amount: number): string {
  const q = [
    `pa=${encodeURIComponent(upiId.trim())}`,
    `pn=${encodeURIComponent((upiName ?? '').trim() || upiId.trim())}`,
    `am=${encodeURIComponent(money2(amount))}`,
    'cu=INR',
    'tn=Hisaab%20settle',
  ];
  return `upi://pay?${q.join('&')}`;
}

/** Light check for a UPI ID like name@bank. */
export const isUpiId = (s: string): boolean => /^[\w.\-]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/.test(s.trim());

/** Plain-text settle-up message listing the items and the total. */
export function settleMessage(b: Pick<Balance, 'name' | 'net' | 'open'>, upi?: { id?: string; name?: string }): string {
  const lines = [`Hi ${b.name}, settling up our shared expenses:`];
  for (const it of b.open) {
    const what = it.card.title || it.card.category || 'Expense';
    const when = it.card.date ? ` (${fmtDate(it.card.date)})` : '';
    const who = it.amount >= 0 ? 'your share' : 'my share';
    lines.push(`- ${what}${when}: ${who} ${inr(Math.abs(it.amount))}`);
  }
  if (b.net > 0) {
    lines.push('', `Total you owe me: ${inr(b.net)}`);
    if (upi?.id) lines.push(`Pay by UPI: ${upiLink(upi.id, upi.name, b.net)}`);
  } else if (b.net < 0) {
    lines.push('', `Total I owe you: ${inr(-b.net)}. Paying you now.`);
  } else {
    lines.push('', 'It all evens out, nothing to pay.');
  }
  lines.push('', 'Sent from Hisaab');
  return lines.join('\n');
}

export const whatsappLink = (text: string): string => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Names to offer as chips: saved names first, then anyone from past splits. */
export function knownPeople(saved: string[] | undefined, cards: Card[]): string[] {
  const out: string[] = [];
  const add = (n: string) => { const c = cleanName(n); if (c && !out.some(x => sameName(x, c))) out.push(c); };
  (saved ?? []).forEach(add);
  for (const c of cards) if (c.type === 'expense' && c.split) c.split.people.forEach(p => add(p.name));
  return out;
}
