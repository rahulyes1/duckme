/** Builds a draft card from quick-add text (Hinglish parser) plus an optional type override. Pure. */
import type { Card, CardType, InvestInfo, InvestKind } from '../../lib/types';
import { KIND_LABEL } from '../../lib/types';
import { addDays, daysBetween, fmtDate, fromISO, inr, toISO, today } from '../../lib/format';
import { dayToDate, parse } from '../../lib/parse';
import { billGuess, DEFAULTS as MONEY_DEFAULTS } from '../money/money-util';

export type Partial0 = Partial<Card> & { type: CardType };

export interface Draft {
  type: CardType;
  partial: Partial0;
  empty: boolean;
  /** Short human summary, e.g. "Bill · ₹2,400 · due 15 Dec · repeats monthly". */
  summary: string;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function buildDraft(text: string, forced: CardType | null, ref: Date = today()): Draft {
  const v = text.trim();
  const p = parse(v, ref);
  const type: CardType = forced ?? (v ? p.type : 'note');
  const title = p.title || cap(v);
  const amount = p.amount ?? undefined;
  const cat = p.category !== 'Other' ? p.category : undefined;
  const monthly = p.repeat === 'monthly';
  let partial: Partial0;

  switch (type) {
    case 'note':
      partial = { type, title: cap(v.replace(/^idea:\s*/i, 'Idea: ')) || 'Your note' };
      break;
    case 'bill': {
      const g = billGuess(v);
      partial = {
        type, title: title || 'Your bill', amount,
        due: p.date ?? toISO(addDays(ref, 7)),
        repeat: g.repeat ?? (monthly ? 'monthly' : 'none'),
        category: g.category ?? cat,
        ...(g.autorenew ? { autorenew: true } : {}),
        ...(g.lastSafe ? { lastSafe: true } : {}),
      };
      break;
    }
    case 'task': {
      const due = p.date ?? undefined;
      partial = {
        type, title: title || 'Your task', due,
        horizon: due && daysBetween(ref, fromISO(due)) <= 7 ? 'week' : 'month',
        repeat: due && monthly ? 'monthly' : 'none',
        amount,
      };
      break;
    }
    case 'expense':
      partial = { type, title: title || 'Your expense', amount: amount ?? 0, date: toISO(ref), category: cat ?? 'Other', mode: 'UPI' };
      break;
    case 'invest': {
      const kind: InvestKind = p.investKind ?? 'Other';
      const instalments = kind === 'SIP' || kind === 'RD';
      const invest: InvestInfo = { kind, value: amount };
      if (instalments) invest.next = p.date ?? toISO(dayToDate(10, -1, ref));
      else if (p.date) invest.maturity = p.date;
      partial = { type, title: title || kind, amount, invest, repeat: instalments ? 'monthly' : 'none' };
      break;
    }
  }

  const bits: string[] = [KIND_LABEL[type]];
  if (partial.amount) bits.push(inr(partial.amount));
  if (type === 'bill' && partial.due) bits.push(`due ${fmtDate(partial.due)}`);
  if (type === 'task' && partial.due) bits.push(`by ${fmtDate(partial.due)}`);
  if (type === 'expense' && partial.category) bits.push(partial.category);
  if (type === 'invest' && partial.invest?.next) bits.push(`next ${fmtDate(partial.invest.next)}`);
  if (type === 'invest' && partial.invest?.maturity) bits.push(`matures ${fmtDate(partial.invest.maturity)}`);
  if (partial.repeat && partial.repeat !== 'none') bits.push(`repeats ${partial.repeat}`);

  return { type, partial, empty: !v, summary: bits.join(' · ') };
}

/** Defaults for a new card picked from the + fan (spec §4: long-press = pick card type). */
export function newCardDefaults(type: CardType): Partial0 {
  switch (type) {
    case 'note': return { type: 'note' };
    case 'task': return { type: 'task', horizon: 'week' };
    case 'expense': return MONEY_DEFAULTS.expense();
    case 'bill': return MONEY_DEFAULTS.bill();
    case 'invest': return MONEY_DEFAULTS.invest();
  }
}
