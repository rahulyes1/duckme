import { describe, expect, it } from 'vitest';
import { newCard } from '../../lib/actions';
import type { Card } from '../../lib/types';
import {
  accountRegister, autopayDebits, NO_ACCOUNT, overCap, removeAccount, renameAccount, shortfall, upsertAccount,
} from './autopay';

const mk = (p: Partial<Card> & { type: Card['type'] }): Card => newCard(p);

describe('overCap', () => {
  it('flags amounts above a set cap only', () => {
    expect(overCap(1500, 1000)).toBe(true);
    expect(overCap(1000, 1000)).toBe(false);
    expect(overCap(1500, undefined)).toBe(false);
    expect(overCap(1500, 0)).toBe(false);
  });
});

describe('shortfall', () => {
  it('is ok when balance covers the total', () => {
    expect(shortfall(5000, 5000)).toEqual({ status: 'ok', shortBy: 0 });
  });
  it('reports how much is short', () => {
    expect(shortfall(3000, 5000)).toEqual({ status: 'short', shortBy: 2000 });
  });
  it('is unknown without a balance', () => {
    expect(shortfall(undefined, 5000)).toEqual({ status: 'unknown', shortBy: 0 });
  });
});

describe('autopayDebits', () => {
  const rent = mk({ type: 'bill', title: 'Rent', amount: 20000, due: '2026-11-28', repeat: 'monthly', autopay: { account: 'HDFC', cap: 15000 } });
  const sip = mk({ type: 'invest', title: 'Index SIP', amount: 5000, invest: { kind: 'SIP', next: '2026-10-30' }, autopay: { account: 'SBI' } });
  const manual = mk({ type: 'bill', title: 'Gas', amount: 900, due: '2026-11-27' });
  const paid = mk({ type: 'bill', title: 'Old', amount: 100, due: '2026-11-27', autopay: { account: 'HDFC' }, status: 'done' });
  const fd = mk({ type: 'invest', title: 'FD', amount: 1e5, invest: { kind: 'FD', maturity: '2026-11-27' }, autopay: { account: 'HDFC' } });

  it('keeps only live autopay cards in the window and expands monthly SIP repeats', () => {
    const out = autopayDebits([rent, sip, manual, paid, fd], '2026-11-25', '2026-12-02');
    expect(out.map(d => [d.card.title, d.date, d.account])).toEqual([
      ['Rent', '2026-11-28', 'HDFC'],
      ['Index SIP', '2026-11-30', 'SBI'],
    ]);
    expect(out[1].projected).toBe(true);
  });
  it('flags cap breaches', () => {
    const out = autopayDebits([rent], '2026-11-25', '2026-12-02');
    expect(out[0].overCap).toBe(true);
  });
  it('expands a monthly bill several times in a long window', () => {
    const out = autopayDebits([rent], '2026-11-01', '2027-02-01');
    expect(out.map(d => d.date)).toEqual(['2026-11-28', '2026-12-28', '2027-01-28']);
  });
});

describe('accountRegister', () => {
  const a = mk({ type: 'bill', title: 'Card', amount: 8000, due: '2026-11-26', autopay: { account: 'HDFC' } });
  const b = mk({ type: 'bill', title: 'Broadband', amount: 1200, due: '2026-11-29', autopay: { account: 'HDFC' } });
  const c = mk({ type: 'bill', title: 'Insurance', amount: 3000, due: '2026-11-27', autopay: {} });
  const d = mk({ type: 'bill', title: 'Netflix', amount: 649, due: '2026-11-27', autopay: { account: 'ICICI' } });

  it('groups by account, totals, and judges the balance', () => {
    const reg = accountRegister([a, b, c, d], [{ name: 'SBI', balance: 100 }, { name: 'HDFC', balance: 5000 }], '2026-11-25', '2026-12-02');
    expect(reg.map(r => r.account)).toEqual(['SBI', 'HDFC', 'ICICI', NO_ACCOUNT]);
    const hdfc = reg[1];
    expect(hdfc.total).toBe(9200);
    expect(hdfc.status).toBe('short');
    expect(hdfc.shortBy).toBe(4200);
    expect(reg[0]).toMatchObject({ total: 0, status: 'ok' });
    expect(reg[2].status).toBe('unknown');
    expect(reg[3].debits.map(x => x.card.title)).toEqual(['Insurance']);
  });
});

describe('account list edits', () => {
  it('adds, updates, renames and removes', () => {
    let l = upsertAccount(undefined, ' HDFC ');
    expect(l).toEqual([{ name: 'HDFC' }]);
    l = upsertAccount(l, 'hdfc', 2500);
    expect(l).toEqual([{ name: 'HDFC', balance: 2500 }]);
    l = upsertAccount(l, 'SBI');
    expect(renameAccount(l, 'SBI', 'hdfc')).toBe(l); // taken
    l = renameAccount(l, 'HDFC', 'HDFC salary');
    expect(l[0]).toEqual({ name: 'HDFC salary', balance: 2500 });
    expect(removeAccount(l, 'sbi')).toEqual([{ name: 'HDFC salary', balance: 2500 }]);
  });
});
