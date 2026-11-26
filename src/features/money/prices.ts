/**
 * Live prices with no login and no server of our own:
 *  - Mutual fund NAVs from api.mfapi.in (free, CORS-enabled). Its cache sometimes drops the CORS header,
 *    so every call carries a cache-buster; the last good value is kept on the device as a fallback.
 *  - Gold (24K, INR per gram) from gold-api.com, falling back to the jsDelivr currency feed. These are
 *    international spot prices; Indian retail is ~6–10% higher, which the gold form adds as a markup.
 * Each value is fetched at most once a day.
 */
import { db } from '../../lib/db';
import { todayISO, toISO } from '../../lib/format';
import type { Card } from '../../lib/types';
import { fdValue, goldValue, mfDate, rankSchemes, rdValue } from './invest-math';

const MF = 'https://api.mfapi.in/mf';
const bust = () => `_=${todayISO()}`;
const CACHE = 'hisaab.prices';
type Cache = Record<string, { v: number; d: string; at: number }>;
const read = (): Cache => { try { return JSON.parse(localStorage.getItem(CACHE) || '{}'); } catch { return {}; } };
const write = (c: Cache) => { try { localStorage.setItem(CACHE, JSON.stringify(c)); } catch { /* private mode */ } };
const fresh = (e?: { at: number }) => !!e && Date.now() - e.at < 20 * 3600 * 1000;

async function getJSON<T>(url: string, ms = 8000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json() as T;
  } finally { clearTimeout(t); }
}

export interface Scheme { schemeCode: number; schemeName: string }

/** Search funds by name. Direct + Growth plans first. */
export async function searchFunds(q: string): Promise<Scheme[]> {
  if (q.trim().length < 3) return [];
  const list = await getJSON<Scheme[]>(`${MF}/search?q=${encodeURIComponent(q.trim())}&${bust()}`);
  return rankSchemes(list).slice(0, 12);
}

/** Latest NAV for a scheme: { nav, date (YYYY-MM-DD) }. Cached for the day; falls back to the last known. */
export async function latestNav(code: number): Promise<{ nav: number; date: string } | null> {
  const c = read(), key = `mf:${code}`;
  if (fresh(c[key])) return { nav: c[key].v, date: c[key].d };
  try {
    const j = await getJSON<{ data: { date: string; nav: string }[] }>(`${MF}/${code}/latest?${bust()}`);
    const row = j.data?.[0];
    if (!row) throw new Error('no data');
    const out = { nav: parseFloat(row.nav), date: mfDate(row.date) };
    c[key] = { v: out.nav, d: out.date, at: Date.now() }; write(c);
    return out;
  } catch {
    return c[key] ? { nav: c[key].v, date: c[key].d } : null;
  }
}

/** NAV on (or just before) a date, for "I invested ₹X on DD-MM" → units. */
export async function navOn(code: number, iso: string): Promise<{ nav: number; date: string } | null> {
  const from = toISO(new Date(new Date(iso + 'T00:00:00').getTime() - 10 * 86400000));
  try {
    const j = await getJSON<{ data: { date: string; nav: string }[] }>(`${MF}/${code}?startDate=${from}&endDate=${iso}&${bust()}`);
    const row = j.data?.find(r => mfDate(r.date) <= iso);
    return row ? { nav: parseFloat(row.nav), date: mfDate(row.date) } : null;
  } catch { return null; }
}

/** 24K gold, INR per gram (international spot, approx.). */
export async function goldPerGram(): Promise<number | null> {
  const c = read();
  if (fresh(c.gold)) return c.gold.v;
  let v: number | null = null;
  try {
    const j = await getJSON<{ price: number }>('https://api.gold-api.com/price/XAU/INR');
    v = j.price / 31.1035;
  } catch {
    try {
      const j = await getJSON<{ xau: { inr: number } }>('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.json');
      v = j.xau.inr / 31.1035;
    } catch { /* offline */ }
  }
  if (v) { c.gold = { v: Math.round(v), d: todayISO(), at: Date.now() }; write(c); return Math.round(v); }
  return c.gold?.v ?? null;
}

/**
 * Bring every investment's value up to date: MF = units × latest NAV, gold = grams × price,
 * FD/RD = interest earned so far by date. Runs at most once a day per card; quiet when offline.
 */
export async function refreshInvestValues(cards: Card[]): Promise<number> {
  const today = todayISO();
  const due = cards.filter(c => c.type === 'invest' && c.status !== 'trashed' && c.invest && (!c.invest.autoAt || toISO(new Date(c.invest.autoAt)) !== today));
  let n = 0;
  let gold: number | null | undefined;
  for (const c of due) {
    const i = c.invest!;
    let patch: Partial<NonNullable<Card['invest']>> | null = null;
    if (i.schemeCode && i.units) {
      const nav = await latestNav(i.schemeCode);
      if (nav) patch = { nav: nav.nav, navDate: nav.date, value: Math.round(i.units * nav.nav) };
    } else if (i.grams) {
      if (gold === undefined) gold = await goldPerGram();
      if (gold) patch = { value: goldValue(i.grams, i.purity ?? 24, gold) };
    } else if (i.kind === 'FD' && i.rate && i.start && i.maturity && c.amount) {
      patch = { value: fdValue(c.amount, i.rate, i.start, i.maturity, today), invested: c.amount };
    } else if (i.kind === 'RD' && i.rate && i.start && i.maturity && c.amount) {
      const r = rdValue(c.amount, i.rate, i.start, i.maturity, today);
      patch = { value: r.value, invested: r.paid };
    }
    if (patch) {
      await db.cards.update(c.id, { invest: { ...i, ...patch, autoAt: Date.now() } });
      n++;
    }
  }
  return n;
}
