/**
 * Hinglish quick-add parser. "bijli 2400 15th" → bill ₹2,400 due on the next 15th.
 * Pure functions; `ref` (today) is injectable for tests.
 */
import type { CardType, InvestKind } from './types';
import { addDays, toISO, today } from './format';

export interface Parsed {
  type: CardType;
  title: string;
  amount: number | null;
  /** YYYY-MM-DD */
  date: string | null;
  category: string;
  repeat: 'none' | 'monthly';
  investKind: InvestKind | null;
}

const BILL_WORDS = ['bijli', 'electricity', 'rent', 'kiraya', 'emi', 'bill', 'recharge', 'wifi', 'broadband', 'gas', 'insurance', 'premium', 'maintenance', 'card', 'subscription', 'school', 'fees', 'fee', 'dth', 'postpaid', 'water', 'paani'];
const INVEST_WORDS: Record<string, InvestKind> = { sip: 'SIP', fd: 'FD', rd: 'RD', ppf: 'PPF', mf: 'MF', gold: 'Gold', sona: 'Gold', stock: 'Stock', stocks: 'Stock', shares: 'Stock', nps: 'NPS' };
const TASK_WORDS = ['karna', 'karo', 'karni', 'todo', 'renew', 'file', 'call', 'book', 'submit', 'update', 'check', 'puc', 'remind', 'yaad', 'banwana', 'lena', 'dena'];
const EXPENSE_WORDS = ['kharcha', 'spent', 'diya', 'khana', 'chai', 'lunch', 'dinner', 'breakfast', 'petrol', 'diesel', 'auto', 'uber', 'ola', 'rapido', 'metro', 'groceries', 'sabzi', 'dawai', 'medicine', 'movie', 'shopping', 'kapde', 'swiggy', 'zomato', 'blinkit', 'zepto', 'doodh'];
const MONTHLY_WORDS = ['rent', 'kiraya', 'bijli', 'electricity', 'emi', 'sip', 'wifi', 'broadband', 'maintenance', 'har', 'monthly', 'mahina'];
const PAID_WORDS = ['paid', 'spent', 'kharcha', 'diya', 'diye', 'bhara', 'bhare', 'bhari'];
/** Words that steer the parser but read oddly in a title ("Credit card bill due" → "Credit card bill"). */
const TITLE_DROP = ['due', 'paid', 'monthly', 'bhara', 'bhare', 'bhari'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const FILLER = ['rs', 'rs.', '₹', 'rupay', 'rupaye', 'rupees', 'ka', 'ki', 'ke', 'ko', 'pe', 'par', 'on', 'by', 'for', 'tak', 'se'];
/** "flat 302", "locker no. 42", "room 5": the number after these is an identifier, not money. */
const ID_WORDS = ['no', 'number', 'num', 'nos', 'flat', 'room', 'house', 'plot', 'block', 'floor', 'gate', 'shop', 'seat', 'roll', 'locker', 'bay', 'unit', 'apt', 'apartment', 'tower', 'wing', 'bed', 'table', 'platform', 'coach', 'pnr', 'otp', 'id'];
const DATE_WORDS = ['tareekh', 'tarikh', 'tarik', 'date'];
const UNIT_WORDS = ['month', 'months', 'mahine', 'mahina', 'day', 'days', 'din', 'year', 'years', 'saal', 'week', 'weeks', 'hour', 'hours', 'hrs', 'min', 'mins', 'minutes', 'baje', 'am', 'pm', 'kg', 'g', 'gm', 'km', 'l', 'litre', 'litres', 'pcs', 'pieces', 'items', 'people', 'log', 'times', 'baar', '%', 'percent'];
const SCALE_WORDS: Record<string, number> = { k: 1e3, thousand: 1e3, hazaar: 1e3, hazar: 1e3, lakh: 1e5, lac: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };

const CATEGORY_MAP: [string, string[]][] = [
  ['Food', ['khana', 'chai', 'lunch', 'dinner', 'breakfast', 'swiggy', 'zomato', 'restaurant', 'cafe', 'coffee']],
  ['Groceries', ['groceries', 'sabzi', 'doodh', 'milk', 'blinkit', 'zepto', 'kirana', 'ration']],
  ['Fuel', ['petrol', 'diesel', 'cng', 'fuel']],
  ['Travel', ['auto', 'uber', 'ola', 'rapido', 'metro', 'cab', 'bus', 'train', 'flight', 'ticket']],
  ['Health', ['dawai', 'medicine', 'doctor', 'hospital', 'pharmacy', 'test']],
  ['Shopping', ['shopping', 'kapde', 'clothes', 'amazon', 'flipkart', 'myntra', 'shoes']],
  ['Entertainment', ['movie', 'netflix', 'hotstar', 'prime', 'spotify', 'concert']],
  ['Rent', ['rent', 'kiraya']],
  ['Bills', ['bijli', 'electricity', 'wifi', 'broadband', 'recharge', 'gas', 'water', 'paani', 'dth', 'postpaid']],
  ['Education', ['school', 'fees', 'fee', 'tuition', 'course', 'books']],
];

const TITLE_FIX: [RegExp, string][] = [
  [/\bbijli\b/i, 'Bijli bill'],
  [/\bkiraya\b/i, 'Rent'],
  [/\bpaani\b/i, 'Water bill'],
];

const norm = (t: string) => t.toLowerCase().replace(/[,.!?;:]+$/, '');

/** Resolve a day-of-month (and optional month index) to the next occurrence on/after ref. */
export function dayToDate(day: number, monthIdx: number, ref: Date): Date {
  // Clamp to the month's last day so "31st" in a 30-day month doesn't spill into the next month.
  const mk = (y: number, m: number) => {
    const t = new Date(y, m, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    return new Date(t.getFullYear(), t.getMonth(), Math.min(day, last));
  };
  if (monthIdx >= 0) {
    let d = mk(ref.getFullYear(), monthIdx);
    if (d < ref) d = mk(ref.getFullYear() + 1, monthIdx);
    return d;
  }
  let d = mk(ref.getFullYear(), ref.getMonth());
  if (d < ref) d = mk(ref.getFullYear(), ref.getMonth() + 1);
  return d;
}

export function parseAmountToken(tok: string): number | null {
  const m = norm(tok).replace(/^₹|^rs\.?/, '').replace(/,/g, '').match(/^(\d+(?:\.\d+)?)(k|l|lakh|lac|cr)?$/);
  if (!m) return null;
  let v = parseFloat(m[1]);
  if (m[2] === 'k') v *= 1e3;
  else if (m[2] === 'cr') v *= 1e7;
  else if (m[2]) v *= 1e5;
  return v;
}

export function parse(text: string, ref: Date = today()): Parsed {
  // "every month", "per month", "har mahine": repeats monthly; the phrase itself isn't part of the title.
  const everyMonth = /(^|\s)(every|per|each|har)\s+(month|mahine|mahina)(?=\s|$)/i;
  const saysMonthly = everyMonth.test(text) || /(^|\s)monthly(?=[\s,.!]|$)/i.test(text);
  text = text.replace(everyMonth, ' ');
  const toks = text.trim().split(/\s+/).filter(Boolean);
  let amount: number | null = null;
  let amountMarked = false;
  let date: Date | null = null;
  const words: string[] = [];

  for (let i = 0; i < toks.length; i++) {
    const raw = toks[i];
    const t = norm(raw);
    const nx = norm(toks[i + 1] ?? '');
    const nxMonth = MONTHS.indexOf(nx.slice(0, 3));
    let m: RegExpMatchArray | null;

    if (t === 'kal' || t === 'tomorrow') { date = addDays(ref, 1); continue; }
    if (t === 'parso' || t === 'parson') { date = addDays(ref, 2); continue; }
    if (t === 'aaj' || t === 'today') { date = ref; continue; }
    if ((m = t.match(/^(\d{1,2})(st|nd|rd|th)$/)) && +m[1] >= 1 && +m[1] <= 31) {
      date = dayToDate(+m[1], nxMonth, ref);
      if (nxMonth >= 0) i++;
      continue;
    }
    if ((m = t.match(/^(\d{1,2})$/)) && +m[1] >= 1 && +m[1] <= 31 && (DATE_WORDS.includes(nx) || nxMonth >= 0)) {
      date = dayToDate(+m[1], nxMonth, ref);
      i++;
      continue;
    }
    if ((m = t.match(/^(\d{1,2})\/(\d{1,2})$/))) {
      date = dayToDate(+m[1], +m[2] - 1, ref);
      continue;
    }
    if (/^#\d+$/.test(raw)) { words.push(raw); continue; }
    let amt = parseAmountToken(raw);
    if (amt !== null && !/^(₹|rs)/i.test(raw) && ID_WORDS.includes(norm(toks[i - 1] ?? ''))) { words.push(raw); continue; }
    if (amt !== null) {
      const marked = /^(₹|rs)/i.test(raw);
      // "12 months", "3 days", "2 kg" are counts, not money.
      if (!marked && UNIT_WORDS.includes(nx)) { words.push(raw); continue; }
      // "₹1 lakh", "5 hazaar", "2 cr" — amount followed by a scale word.
      const scale = SCALE_WORDS[nx];
      if (scale && /^\D*\d+(\.\d+)?$/.test(t)) { amt *= scale; i++; }
      // A ₹-marked amount wins over an earlier bare number.
      if (amount === null || (marked && !amountMarked)) {
        amount = amt; amountMarked = marked;
        continue;
      }
    }
    if (FILLER.includes(t)) continue;
    words.push(raw);
  }

  const lw = words.map(norm);
  const has = (arr: string[]) => lw.some(w => arr.includes(w));
  const investKind = (lw.map(w => INVEST_WORDS[w]).find(Boolean) as InvestKind | undefined) ?? null;

  let type: CardType;
  if (investKind) type = 'invest';
  // "paid rent 18000", "bijli 2400 bhara": already paid, so it's a spend, not a bill to pay.
  // (A credit card bill stays a bill: paying it isn't a new spend.)
  else if (amount !== null && has(PAID_WORDS) && !has(['card'])) type = 'expense';
  else if (has(BILL_WORDS) || (amount !== null && (date !== null || saysMonthly))) type = 'bill';
  else if (has(EXPENSE_WORDS) && amount !== null) type = 'expense';
  else if (has(TASK_WORDS) || date !== null) type = 'task';
  else if (amount !== null) type = 'expense';
  else type = 'note';

  let title = words.filter(w => !TITLE_DROP.includes(norm(w))).join(' ').replace(/^(idea|note|todo):\s*/i, '');
  for (const [re, rep] of TITLE_FIX) title = title.replace(re, rep);
  title = title ? title[0].toUpperCase() + title.slice(1) : '';
  if (!title && investKind) title = investKind;

  const category = CATEGORY_MAP.find(([, ws]) => lw.some(w => ws.includes(w)))?.[0] ?? 'Other';
  const repeat = saysMonthly || has(MONTHLY_WORDS) ? 'monthly' : 'none';

  return { type, title, amount, date: date ? toISO(date) : null, category, repeat, investKind };
}

export interface SmartChip {
  /** The matched text inside the note. */
  match: string;
  amount: number | null;
  date: string | null;
  suggest: 'bill' | 'expense' | 'task';
  /** True for one chip that stands for a whole checklist's total. */
  total?: boolean;
}

/**
 * Finds money/date phrases inside free text, line by line, e.g.
 * "Pay plumber 1500 on 12th" → { amount: 1500, date: next 12th, suggest: 'bill' }.
 */
export function detectChips(text: string, ref: Date = today()): SmartChip[] {
  const out: SmartChip[] = [];
  for (const line of text.split(/\n/)) {
    const l = line.trim();
    if (!l) continue;
    const hasAmt = /(?:₹|rs\.?\s?)?\b\d[\d,]*(?:\.\d+)?\s?(?:k|l|lakh|cr)?\b/i.test(l) && /\d{2,}|\d+\s?(k|l|lakh|cr)\b|₹\s?\d/i.test(l);
    const hasDate = /\b(\d{1,2}(st|nd|rd|th)|kal|parso|tomorrow|aaj|today|\d{1,2}\s+(tareekh|tarikh|date|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*|\d{1,2}\/\d{1,2})\b/i.test(l);
    if (!hasAmt && !hasDate) continue;
    const p = parse(l.replace(/,(?=\d{3})/g, ''), ref);
    if (p.amount === null && p.date === null) continue;
    // Money without a date only becomes a chip on short list-like lines ("chai 40"),
    // not inside long sentences that merely mention a number.
    if (p.date === null && l.split(/\s+/).length > 6) continue;
    const suggest = p.amount !== null && p.date !== null ? 'bill' : p.amount !== null ? 'expense' : 'task';
    out.push({ match: l, amount: p.amount, date: p.date, suggest });
  }
  return out.slice(0, 6);
}

/** Sum of ₹ amounts found in checklist lines (self-totalling lists). */
export function lineAmount(text: string): number | null {
  // "Locker no. 42", "flat 302", "#7" are identifiers, not prices.
  text = text.replace(new RegExp(`\\b(?:${ID_WORDS.join('|')})\\.?\\s*#?\\d+`, 'gi'), ' ').replace(/#\d+/g, ' ');
  const m = text.replace(/,(?=\d{2,3}\b|\d{2,3},)/g, '').match(/(?:₹|rs\.?\s?)\s?(\d+(?:\.\d+)?)(k|l|lakh)?|\b(\d+(?:\.\d+)?)(k|l|lakh)\b|\b(\d{2,}(?:\.\d+)?)\b/i);
  if (!m) return null;
  const num = m[1] ?? m[3] ?? m[5];
  const suf = (m[2] ?? m[4] ?? '').toLowerCase();
  let v = parseFloat(num);
  if (suf === 'k') v *= 1e3; else if (suf) v *= 1e5;
  // Ignore things that look like years or day numbers without a ₹ sign.
  if (!m[1] && (v >= 1900 && v <= 2100 && !suf)) return null;
  return v;
}
