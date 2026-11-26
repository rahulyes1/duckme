/**
 * Autopay / mandate register: pure rules, no database and no UI (unit tested in autopay.test.ts).
 * Every number here is something the user typed. Hisaab never talks to a bank.
 */
import type { Card, Settings } from '../../lib/types';
import { dueItemsInRange } from './cashflow';

export type Account = NonNullable<Settings['accounts']>[number];

/** Group name for autopay cards that don't say which account they debit. */
export const NO_ACCOUNT = 'No account set';

export interface AutopayDebit {
  card: Card;
  date: string;
  amount: number;
  kind: 'bill' | 'sip';
  /** A future repeat (not its own card yet). */
  projected: boolean;
  account: string;
  cap?: number;
  /** Amount is above the mandate cap, so the debit may fail. */
  overCap: boolean;
}

export type BalanceStatus = 'ok' | 'short' | 'unknown';

export interface AccountSummary {
  account: string;
  balance?: number;
  debits: AutopayDebit[];
  total: number;
  status: BalanceStatus;
  /** How much more the account needs (0 unless status is 'short'). */
  shortBy: number;
  capBreaches: AutopayDebit[];
}

/** True when an amount is above a set mandate cap. No cap = no breach. */
export function overCap(amount: number, cap: number | undefined): boolean {
  return cap !== undefined && cap !== null && cap > 0 && amount > cap;
}

/** Balance vs. what will leave the account. Unknown balance can't be judged. */
export function shortfall(balance: number | undefined, total: number): { status: BalanceStatus; shortBy: number } {
  if (balance === undefined || balance === null || !Number.isFinite(balance)) return { status: 'unknown', shortBy: 0 };
  if (balance >= total) return { status: 'ok', shortBy: 0 };
  return { status: 'short', shortBy: total - balance };
}

const accountOf = (c: Card): string => c.autopay?.account?.trim() || NO_ACCOUNT;

/**
 * Autopay debits in [from, to): live bills (by due date, repeats expanded) and SIP/RD instalments
 * (by next date, monthly) that have card.autopay set. Maturities are money coming in, so skipped.
 */
export function autopayDebits(cards: Card[], from: string, to: string): AutopayDebit[] {
  const withAutopay = cards.filter(c => !!c.autopay && (c.type === 'bill' || c.type === 'invest'));
  return dueItemsInRange(withAutopay, from, to)
    .filter(i => i.kind !== 'maturity')
    .map(i => {
      const cap = i.card.autopay?.cap;
      return {
        card: i.card, date: i.date, amount: i.amount, kind: i.kind as 'bill' | 'sip', projected: i.projected,
        account: accountOf(i.card), cap, overCap: overCap(i.amount, cap),
      };
    });
}

/**
 * One summary per account: accounts from settings first (in your order, even with nothing due),
 * then any account names used on cards but not saved yet, then "No account set" last.
 */
export function accountRegister(cards: Card[], accounts: Account[] | undefined, from: string, to: string): AccountSummary[] {
  const debits = autopayDebits(cards, from, to);
  const names: string[] = [];
  const add = (n: string) => { if (!names.includes(n)) names.push(n); };
  for (const a of accounts ?? []) if (a.name.trim()) add(a.name.trim());
  const extra = new Set<string>();
  for (const c of cards) if (c.autopay && (c.type === 'bill' || c.type === 'invest')) extra.add(accountOf(c));
  for (const d of debits) extra.add(d.account);
  for (const n of [...extra].filter(n => n !== NO_ACCOUNT).sort()) add(n);
  if (extra.has(NO_ACCOUNT)) add(NO_ACCOUNT);

  return names.map(name => {
    const mine = debits.filter(d => d.account === name);
    const total = mine.reduce((s, d) => s + d.amount, 0);
    const balance = name === NO_ACCOUNT ? undefined : accounts?.find(a => a.name.trim() === name)?.balance;
    const sf = mine.length ? shortfall(balance, total) : { status: (balance === undefined ? 'unknown' : 'ok') as BalanceStatus, shortBy: 0 };
    return { account: name, balance, debits: mine, total, status: sf.status, shortBy: sf.shortBy, capBreaches: mine.filter(d => d.overCap) };
  });
}

/* ---------- account list edits (settings.accounts) ---------- */

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Adds an account, or updates its balance if the name already exists (case-insensitive). */
export function upsertAccount(list: Account[] | undefined, name: string, balance?: number): Account[] {
  const n = name.trim();
  const cur = list ?? [];
  if (!n) return cur;
  const i = cur.findIndex(a => same(a.name, n));
  if (i < 0) return [...cur, balance === undefined ? { name: n } : { name: n, balance }];
  return cur.map((a, k) => (k === i ? { ...a, balance } : a));
}

/** Renames an account. Refuses (returns the list unchanged) when the new name is empty or taken. */
export function renameAccount(list: Account[] | undefined, from: string, to: string): Account[] {
  const cur = list ?? [];
  const n = to.trim();
  if (!n) return cur;
  if (cur.some(a => same(a.name, n) && !same(a.name, from))) return cur;
  return cur.map(a => (same(a.name, from) ? { ...a, name: n } : a));
}

export function removeAccount(list: Account[] | undefined, name: string): Account[] {
  return (list ?? []).filter(a => !same(a.name, name));
}
