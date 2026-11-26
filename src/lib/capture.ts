/**
 * Faster expense capture, all on the device:
 *  - parseBankSms: a pasted bank / UPI SMS → amount, merchant, mode, date
 *  - parseSpoken:  "250 auto", "lunch 180 card" → amount, title, category, mode
 *  - usualSpends:  what you log again and again ("Chai ₹20"), best match for this time of day first
 *  - recurringCandidates: the same payment in 3+ months with no bill tracking it ("Netflix ₹649")
 * Pure functions; tested in capture.test.ts.
 */
import type { Card } from './types';
import { toISO } from './format';

/* ---------------- categories from words ---------------- */

const CAT_WORDS: [string, RegExp][] = [
  ['Food', /\b(swiggy|zomato|eatsure|domino|pizza|kfc|mcdonald|burger|starbucks|cafe|coffee|chai|tea|lunch|dinner|breakfast|snacks?|biryani|restaurant|hotel|dhaba|canteen|food)\b/i],
  ['Groceries', /\b(blinkit|zepto|instamart|bigbasket|big ?basket|dmart|d-mart|jiomart|grofers|reliance fresh|more ?retail|kirana|grocer(y|ies)|vegetables?|sabzi|milk|doodh|fruits?)\b/i],
  ['Travel', /\b(uber|ola|rapido|auto|rickshaw|cab|taxi|metro|irctc|train|bus|redbus|makemytrip|goibibo|indigo|air ?india|vistara|akasa|flight|toll|fastag|parking)\b/i],
  ['Fuel', /\b(petrol|diesel|fuel|hpcl|bpcl|iocl|indian ?oil|bharat ?petroleum|hindustan ?petroleum|shell|nayara|cng)\b/i],
  ['Shopping', /\b(amazon|flipkart|myntra|ajio|meesho|nykaa|tata ?cliq|croma|reliance ?digital|decathlon|ikea|shopping|clothes|shoes)\b/i],
  ['Bills', /\b(electricity|bijli|bescom|msedcl|tata ?power|adani|airtel|jio|vodafone|\bvi\b|bsnl|broadband|recharge|dth|tata ?play|gas ?bill|indane|hp ?gas|water ?bill|credit ?card ?bill|emi)\b/i],
  ['Rent', /\b(rent|nobroker|landlord|pg|maintenance)\b/i],
  ['Health', /\b(apollo|pharmeasy|1mg|netmeds|medplus|pharmacy|chemist|medicine|doctor|clinic|hospital|lab|diagnostic|practo)\b/i],
  ['Entertainment', /\b(netflix|hotstar|prime ?video|spotify|youtube|bookmyshow|pvr|inox|movie|sonyliv|zee5|jiocinema|gaming|steam)\b/i],
  ['Education', /\b(udemy|coursera|byju|unacademy|school|college|tuition|fees|books?|course)\b/i],
  ['Staff', /\b(maid|bai|cook|driver|nanny|salary to|watchman)\b/i],
];

export function guessCategory(text: string): string | null {
  for (const [cat, re] of CAT_WORDS) if (re.test(text)) return cat;
  return null;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, m => m.toUpperCase()).trim();

/* ---------------- bank / UPI SMS ---------------- */

export interface SmsSpend { amount: number; merchant: string; mode: 'UPI' | 'Card' | 'Net banking' | 'Cash' | 'Auto-debit'; date: string | null; category: string | null }

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function smsDate(text: string, ref: Date): string | null {
  const y2 = (y: string) => (y.length === 2 ? 2000 + +y : +y);
  let m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const d = new Date(y2(m[3]), +m[2] - 1, +m[1]);
    if (!isNaN(d.getTime()) && +m[2] <= 12) return toISO(d);
  }
  // "24-Nov-26", "26Nov26", "5 Dec": keep looking past false starts like "00 spent".
  for (const x of text.matchAll(/\b(\d{1,2})[-\s]?([A-Za-z]{3})[a-z]*[-\s,]*(\d{2,4})?\b/g)) {
    const mon = MONTHS[x[2].toLowerCase()];
    if (mon === undefined) continue;
    const d = new Date(x[3] ? y2(x[3]) : ref.getFullYear(), mon, +x[1]);
    if (!isNaN(d.getTime())) return toISO(d);
  }
  return null;
}

function smsMerchant(text: string): string {
  const pats = [
    /\bVPA\s+([\w.\-]+)@[\w.]+/i,                               // to VPA swiggy.stores@axisbank
    /\bto\s+([A-Za-z0-9 &.'\-]{2,40}?)(?:\s+on\b|\s+UPI|\s+Ref|\s+via|\.|,|\s+Avl|\s+-|$)/i,   // to SWIGGY on 12-11
    /\bat\s+([A-Za-z0-9 &.'\-]{2,40}?)(?:\s+on\b|\s+Ref|\.|,|\s+Avl|\s+-|$)/i,                   // at AMAZON PAY on
    /\bInfo:?\s*(?:UPI\/)?(?:P2M\/|P2A\/)?(?:\d+\/)?([A-Za-z][A-Za-z0-9 &.'\-]{1,40}?)(?:\/|\.|,|$)/i,  // Info: UPI/P2M/1234/ZOMATO
    /;\s*([A-Za-z][A-Za-z0-9 &.'\-]{2,40}?)\s+credited/i,                                           // ; ZEPTO credited
  ];
  for (const p of pats) {
    const m = text.match(p);
    if (m) {
      const raw = m[1].replace(/[._-]+/g, ' ').replace(/\b(stores?|payments?|pvt|ltd|limited|india|online|upi)\b/gi, '').replace(/\s+/g, ' ').trim();
      if (raw && !/^(your|a\/c|ac|account|xx)/i.test(raw)) return titleCase(raw);
    }
  }
  return '';
}

/** Read a bank / UPI SMS. Returns null for credits, OTPs and anything that isn't a spend. */
export function parseBankSms(text: string, ref: Date = new Date()): SmsSpend | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || /\b(otp|one time password)\b/i.test(t)) return null;
  const credit = /\b(credited to your|received|has been credited|refund|cashback|deposited)\b/i.test(t) && !/\b(debited|spent|paid|sent|withdrawn|purchase)\b/i.test(t);
  if (credit) return null;
  if (!/\b(debited|spent|paid|sent|withdrawn|purchase|txn|transaction|dr\.?)\b/i.test(t)) return null;
  const am = t.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!am) return null;
  const amount = Math.round(parseFloat(am[1].replace(/,/g, '')) * 100) / 100;
  if (!amount) return null;
  const mode: SmsSpend['mode'] = /\b(upi|vpa|gpay|phonepe|paytm)\b/i.test(t) ? 'UPI'
    : /\b(credit card|debit card|card ending|card no|card xx|\bcard\b)/i.test(t) ? 'Card'
    : /\b(neft|imps|rtgs|net ?banking)\b/i.test(t) ? 'Net banking'
    : /\b(nach|ecs|auto ?debit|si\b|standing instruction|mandate)\b/i.test(t) ? 'Auto-debit'
    : /\b(atm|withdrawn)\b/i.test(t) ? 'Cash' : 'UPI';
  const merchant = smsMerchant(t);
  return { amount, merchant, mode, date: smsDate(t, ref), category: guessCategory(`${merchant} ${t}`) };
}

/* ---------------- spoken / typed short form ---------------- */

export interface Spoken { amount: number | null; title: string; category: string | null; mode: string | null }

const NUM_WORDS: Record<string, number> = { hundred: 100, thousand: 1000, k: 1000, lakh: 100000 };

/** "250 auto", "lunch 180 by card", "spent 2.5k on groceries", "1 thousand petrol" */
export function parseSpoken(text: string): Spoken {
  let t = ` ${text.toLowerCase().replace(/[₹,]/g, ' ').replace(/rupees?|rs\.?/g, ' ')} `;
  let amount: number | null = null;
  const m = t.match(/\s(\d+(?:\.\d+)?)\s*(k|thousand|hundred|lakh)?\b/);
  if (m) {
    amount = parseFloat(m[1]) * (m[2] ? NUM_WORDS[m[2]] : 1);
    t = t.replace(m[0], ' ');
  }
  let mode: string | null = null;
  const md = t.match(/\b(?:by |via |on |with |using )?(upi|gpay|phonepe|paytm|card|credit card|debit card|cash|net ?banking)\b/);
  if (md) {
    mode = /card/.test(md[1]) ? 'Card' : md[1] === 'cash' ? 'Cash' : /net/.test(md[1]) ? 'Net banking' : 'UPI';
    t = t.replace(md[0], ' ');
  }
  const category = guessCategory(t);
  const title = titleCase(t.replace(/\b(spent|paid|for|on|at|to|the|a|an|i|my|of)\b/g, ' ').replace(/\s+/g, ' '));
  return { amount: amount && amount > 0 ? Math.round(amount * 100) / 100 : null, title, category, mode };
}

/* ---------------- your usual spends ---------------- */

export interface Usual { title: string; amount: number; category: string; mode: string; count: number }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Spends you repeat (same title + amount, 3+ times in 45 days), best for this hour of the day first. Max 4. */
export function usualSpends(cards: Card[], now: Date): Usual[] {
  // 45 days: frequent habits (chai, auto), not monthly payments like Netflix (those become bills instead).
  const from = toISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 45));
  const groups = new Map<string, { u: Usual; hours: number[] }>();
  for (const c of cards) {
    if (c.type !== 'expense' || c.status === 'trashed' || c.status === 'killed' || !c.date || c.date < from || !c.amount || c.split) continue;
    const title = (c.title || c.category || '').trim();
    if (!title || / paid$/i.test(title)) continue; // bill payments aren't impulse spends
    const key = `${norm(title)}|${c.amount}`;
    const g = groups.get(key) ?? { u: { title, amount: c.amount, category: c.category ?? 'Other', mode: c.mode ?? 'UPI', count: 0 }, hours: [] };
    g.u.count++;
    g.hours.push(new Date(c.createdAt || 0).getHours());
    groups.set(key, g);
  }
  const h = now.getHours();
  return [...groups.values()]
    .filter(g => g.u.count >= 3)
    .map(g => ({ g, score: g.u.count + 2 * g.hours.filter(x => Math.abs(x - h) <= 2).length / g.hours.length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(x => x.g.u);
}

/* ---------------- repeat payments that deserve a bill ---------------- */

export interface Recurring { title: string; amount: number; day: number; category: string; months: number }

/** Same payee and roughly the same amount (±10%) in 3+ different months, recently, with no live bill for it. */
export function recurringCandidates(cards: Card[], now: Date): Recurring[] {
  const recent = toISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 45));
  const billNames = cards.filter(c => c.type === 'bill' && c.status !== 'trashed' && c.status !== 'killed').map(c => norm(c.title));
  const byTitle = new Map<string, Card[]>();
  for (const c of cards) {
    if (c.type !== 'expense' || c.status === 'trashed' || c.status === 'killed' || !c.date || !c.amount || !c.title) continue;
    if (/ paid$/i.test(c.title) || c.category === 'Bills' && c.links.length) continue; // already a bill payment
    const k = norm(c.title);
    byTitle.set(k, [...(byTitle.get(k) ?? []), c]);
  }
  const out: Recurring[] = [];
  for (const [k, list] of byTitle) {
    if (billNames.some(b => b && (b.includes(k) || k.includes(b)))) continue;
    const sorted = [...list].sort((a, b) => (a.date! < b.date! ? 1 : -1));
    const ref = sorted[0];
    if (ref.date! < recent) continue;
    const similar = sorted.filter(c => Math.abs(c.amount! - ref.amount!) <= ref.amount! * 0.1);
    const months = new Set(similar.map(c => c.date!.slice(0, 7)));
    if (months.size < 3) continue;
    const days = similar.map(c => +c.date!.slice(8, 10)).sort((a, b) => a - b);
    out.push({ title: ref.title, amount: ref.amount!, day: days[Math.floor(days.length / 2)], category: ref.category ?? 'Bills', months: months.size });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

/* ---------------- the pen line: "250 auto cash yday" ---------------- */

export interface PenLine extends Spoken { date: string }

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * One typed line in the passbook → a spend. Understands day words (today/aaj, yday/yesterday/kal, a weekday,
 * "on 24th"), and learns category + mode from your own past spends with the same name.
 */
export function parsePenLine(text: string, ref: Date, history: Card[] = []): PenLine {
  let t = ` ${text.toLowerCase()} `;
  let date = toISO(ref);
  const day = (n: number) => toISO(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - n));
  const dm = t.match(/\s(yday|yest(?:erday)?|kal|parso|today|aaj)\s/);
  if (dm) {
    date = dm[1] === 'parso' ? day(2) : /^(today|aaj)$/.test(dm[1]) ? day(0) : day(1);
    t = t.replace(dm[0], ' ');
  } else {
    const wd = t.match(/\s(?:on |last )?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s/);
    if (wd) {
      const idx = WEEKDAYS.findIndex(w => w.startsWith(wd[1]));
      const back = (ref.getDay() - idx + 7) % 7 || 7;
      date = day(back === 7 && idx === ref.getDay() ? 0 : back);
      t = t.replace(wd[0], ' ');
    } else {
      const on = t.match(/\son (\d{1,2})(?:st|nd|rd|th)?\s/);
      if (on && +on[1] >= 1 && +on[1] <= 31) {
        const d = new Date(ref.getFullYear(), ref.getMonth(), +on[1]);
        if (d > ref) d.setMonth(d.getMonth() - 1);
        date = toISO(d);
        t = t.replace(on[0], ' ');
      }
    }
  }
  const s = parseSpoken(t);
  // Learn from history: the last spend with the same name decides category and mode when the words don't.
  if (s.title) {
    const key = norm(s.title);
    const past = history
      .filter(c => c.type === 'expense' && c.status !== 'trashed' && norm(c.title || '') === key)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
    if (past) {
      if (!s.category && past.category) s.category = past.category;
      if (!s.mode && past.mode) s.mode = past.mode;
    }
  }
  return { ...s, date };
}

/* ---------------- close the khata (evening sweep) ---------------- */

export interface DaySweep { total: number; count: number; missed: Usual[]; lastAt: number | null }

/** Today so far: total, count, usual spends you normally log by now but haven't, and when you last logged one. */
export function daySweep(cards: Card[], now: Date): DaySweep {
  const t = toISO(now);
  const today = cards.filter(c => c.type === 'expense' && c.status !== 'trashed' && c.status !== 'killed' && c.date === t);
  const logged = new Set(today.map(c => norm(c.title || '')));
  const missed = usualSpends(cards, now).filter(u => !logged.has(norm(u.title)));
  const lastAt = today.reduce<number | null>((m, c) => (c.createdAt && (!m || c.createdAt > m) ? c.createdAt : m), null);
  return { total: today.reduce((s, c) => s + (c.amount ?? 0), 0), count: today.length, missed, lastAt };
}

/* ---------------- duplicate guard ---------------- */

/** A spend that looks like one you just logged: same amount and category (or title) within 10 minutes. */
export function looksDuplicate(cards: Card[], s: { amount: number; category?: string | null; title?: string; date: string }, now: number): Card | null {
  return cards.find(c => c.type === 'expense' && c.status !== 'trashed' && c.date === s.date && c.amount === s.amount
    && (c.category === s.category || (!!s.title && norm(c.title || '') === norm(s.title)))
    && now - (c.createdAt || 0) < 10 * 60 * 1000) ?? null;
}
