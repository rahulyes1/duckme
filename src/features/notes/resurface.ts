/**
 * "Last time" lines for the Today page. Pure date / title matching over cards, no guessing:
 *  (a) Last year this week: a bill, expense or note dated within ±7 days of today one year ago.
 *  (b) For open bills due in the next 10 days: what you paid last time for the same title.
 */
import type { Card } from '../../lib/types';
import { isActive } from '../../lib/types';
import { addMonthsISO, daysBetween, fmtDate, fromISO, inr, toISO } from '../../lib/format';
import { TEMPLATE_LABEL } from './templates';

export interface ResurfaceLine {
  kind: 'last-year' | 'last-paid';
  /** Card to open when tapped. */
  cardId: string;
  /** Bold lead, e.g. "Last year this week" or "Last electricity bill". */
  lead: string;
  /** e.g. "Car insurance ₹14,200" or "₹2,350 on 12-10-2026". */
  text: string;
}

const gone = (c: Card) => c.status === 'trashed' || c.status === 'killed';
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const isoOfMs = (ms: number) => toISO(new Date(ms));

/** The date that "places" a card in time. Notes use their creation date; journals and templates are skipped. */
function placeDate(c: Card): string | undefined {
  if (c.type === 'expense') return c.date;
  if (c.type === 'bill') return c.due ?? (c.doneAt ? isoOfMs(c.doneAt) : undefined);
  if (c.type === 'note') {
    if (c.journalDate || c.locked || c.labels.includes(TEMPLATE_LABEL)) return undefined;
    if (!c.title.trim() && !c.body.trim()) return undefined;
    return isoOfMs(c.createdAt);
  }
  return undefined;
}

const firstLine = (s: string) => s.split('\n').map(l => l.replace(/^\s*(#{1,2}\s+|[-*•]\s+|\[[ xX]?\]\s?)/, '').replace(/\*\*/g, '').trim()).find(Boolean) ?? '';
const short = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function lastYearThisWeek(cards: Card[], todayIso: string): ResurfaceLine | null {
  const anchor = fromISO(addMonthsISO(todayIso, -12));
  let best: { c: Card; dist: number } | null = null;
  for (const c of cards) {
    if (gone(c)) continue;
    const d = placeDate(c);
    if (!d) continue;
    const dist = Math.abs(daysBetween(anchor, fromISO(d)));
    if (dist > 7) continue;
    // Prefer money (bigger amount first), then the closest date.
    const better = !best
      || (c.amount ?? 0) > (best.c.amount ?? 0)
      || ((c.amount ?? 0) === (best.c.amount ?? 0) && dist < best.dist);
    if (better) best = { c, dist };
  }
  if (!best) return null;
  const c = best.c;
  const name = short(c.title.trim() || firstLine(c.body) || 'A note');
  return { kind: 'last-year', cardId: c.id, lead: 'Last year this week', text: c.amount ? `${name} ${inr(c.amount)}` : name };
}

/** "Electricity bill" → "electricity bill"; keeps "HDFC card" as is. */
const lowerFirst = (s: string) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s);

export function lastPaidForUpcoming(cards: Card[], todayIso: string, max = 2): ResurfaceLine[] {
  const today = fromISO(todayIso);
  const upcoming = cards
    .filter(c => c.type === 'bill' && isActive(c) && !!c.due && !!c.title.trim())
    .filter(c => { const n = daysBetween(today, fromISO(c.due!)); return n >= 0 && n <= 10; })
    .sort((a, b) => a.due!.localeCompare(b.due!));

  const out: ResurfaceLine[] = [];
  const seen = new Set<string>();
  for (const bill of upcoming) {
    const key = norm(bill.title);
    if (seen.has(key)) continue;
    seen.add(key);
    let best: { amount: number; date: string; expense: boolean } | null = null;
    const consider = (amount: number | undefined, date: string | undefined, expense: boolean) => {
      if (!amount || amount <= 0 || !date || date > todayIso) return;
      if (!best || date > best.date || (date === best.date && expense && !best.expense)) best = { amount, date, expense };
    };
    for (const c of cards) {
      if (c.id === bill.id || gone(c)) continue;
      if (c.type === 'expense') {
        const t = norm(c.title).replace(/ paid$/, '');
        if (t === key) consider(c.amount, c.date, true);
      } else if (c.type === 'bill' && c.status === 'done' && norm(c.title) === key) {
        consider(c.amount, c.doneAt ? isoOfMs(c.doneAt) : c.due, false);
      }
    }
    if (!best) continue;
    const b = best as { amount: number; date: string };
    out.push({ kind: 'last-paid', cardId: bill.id, lead: `Last ${lowerFirst(bill.title.trim())}`, text: `${inr(b.amount)} on ${fmtDate(b.date)}` });
    if (out.length >= max) break;
  }
  return out;
}

/** Up to 2 lines: one "last year" line plus one "last paid" line, or two "last paid" lines if there is no "last year". */
export function resurface(cards: Card[], todayIso: string): ResurfaceLine[] {
  const a = lastYearThisWeek(cards, todayIso);
  const b = lastPaidForUpcoming(cards, todayIso, a ? 1 : 2);
  return [...(a ? [a] : []), ...b].slice(0, 2);
}
