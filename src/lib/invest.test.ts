import { describe, expect, it } from 'vitest';
import type { Card } from './types';
import { investKindFromText } from './capture';
import { isInvestLog, isSpend, monthTotalsByCategory } from './logic';
import { newCard, planInvestLog } from './actions';
import { cashFlow, safeToSpend, salaryCycle } from '../features/money/cashflow';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const mk = (p: Partial<Card> & { type: Card['type'] }): Card => newCard(p);

describe('investKindFromText — investments are not spends', () => {
  it('finds SIP, MF and MF', () => {
    expect(investKindFromText('SIP 50000')).toBe('SIP');
    expect(investKindFromText('Groww mutual fund 5000')).toBe('MF');
    expect(investKindFromText('NACH debit BSE STAR MF')).toBe('MF');
  });
  it('leaves everyday spends alone, plain gold included', () => {
    expect(investKindFromText('lunch 180')).toBeNull();
    expect(investKindFromText('auto 250')).toBeNull();
    expect(investKindFromText('gold earrings 9000')).toBeNull();
  });
  it('other kinds, whole words only, any case', () => {
    expect(investKindFromText('nps tier 1')).toBe('NPS');
    expect(investKindFromText('PPF deposit')).toBe('PPF');
    expect(investKindFromText('Recurring deposit 2000')).toBe('RD');
    expect(investKindFromText('fd renewal')).toBe('FD');
    expect(investKindFromText('SGB tranche')).toBe('Gold');
    expect(investKindFromText('Sovereign gold bond')).toBe('Gold');
    expect(investKindFromText('Zerodha 10000')).toBe('MF');
    expect(investKindFromText('gossip')).toBeNull();
    expect(investKindFromText('birdfood 120')).toBeNull();
    expect(investKindFromText('')).toBeNull();
  });
});

describe('isSpend', () => {
  it('counts live expenses that are not investments', () => {
    expect(isSpend(mk({ type: 'expense', title: 'Lunch', category: 'Food' }))).toBe(true);
    expect(isSpend(mk({ type: 'expense', title: 'SIP 5000', category: 'Other' }))).toBe(false);
    expect(isSpend(mk({ type: 'expense', title: 'Axis fund', category: 'Investment' }))).toBe(false);
    expect(isSpend(mk({ type: 'expense', title: 'Lunch', status: 'trashed' }))).toBe(false);
    expect(isSpend(mk({ type: 'expense', title: 'Lunch', status: 'killed' }))).toBe(false);
    expect(isSpend(mk({ type: 'bill', title: 'Rent' }))).toBe(false);
  });
  it('investment lines are their own thing', () => {
    expect(isInvestLog(mk({ type: 'expense', title: 'SIP 5000' }))).toBe(true);
    expect(isInvestLog(mk({ type: 'expense', title: 'Lunch' }))).toBe(false);
  });
  it('month totals leave investments out', () => {
    const t = monthTotalsByCategory([
      mk({ type: 'expense', title: 'Lunch', amount: 200, date: '2026-11-03', category: 'Food' }),
      mk({ type: 'expense', title: 'SIP', amount: 5000, date: '2026-11-05', category: 'Investment' }),
    ], '2026-11');
    expect(t.total).toBe(200);
    expect(t.byCategory).toEqual([['Food', 200]]);
  });
});

describe('cashFlow with investments', () => {
  const ref = d(2026, 11, 27);
  it('spent excludes a SIP logged as an expense, but it still leaves the account', () => {
    const f = cashFlow([
      mk({ type: 'expense', title: 'Lunch', amount: 500, date: '2026-11-26', category: 'Food' }),
      mk({ type: 'expense', title: 'SIP 50000', amount: 50000, date: '2026-11-26', category: 'Other' }),
    ], 100000, 25, ref);
    expect(f.spent).toBe(500);
    expect(f.invested).toBe(50000);
    expect(f.left).toBe(100000 - 500 - 50000);
  });
  it('a SIP card and its matching log are counted once', () => {
    const sip = mk({ type: 'invest', title: 'Axis SIP', amount: 5000, invest: { kind: 'SIP', next: '2026-12-05' } });
    const byAmount = mk({ type: 'expense', title: 'Axis', amount: 5000, date: '2026-11-26', category: 'Investment' });
    const f = cashFlow([sip, byAmount], 60000, 25, ref);
    expect(f.sipsTotal).toBe(0);
    expect(f.invested).toBe(5000);
    expect(f.left).toBe(55000);

    const linkedLog = mk({ type: 'expense', title: 'Paid', amount: 4800, date: '2026-11-26', category: 'Investment', links: [sip.id] });
    const g = cashFlow([sip, linkedLog], 60000, 25, ref);
    expect(g.sipsTotal).toBe(0);
    expect(g.left).toBe(60000 - 4800);

    const h = cashFlow([sip], 60000, 25, ref);
    expect(h.sipsTotal).toBe(5000);
    expect(h.left).toBe(55000);
  });
  it('one log covers one instalment only', () => {
    const a = mk({ type: 'invest', title: 'A', amount: 5000, invest: { kind: 'SIP', next: '2026-12-01' } });
    const b = mk({ type: 'invest', title: 'B', amount: 5000, invest: { kind: 'SIP', next: '2026-12-02' } });
    const log = mk({ type: 'expense', title: 'SIP', amount: 5000, date: '2026-11-26', category: 'Investment' });
    const f = cashFlow([a, b, log], 60000, 25, ref);
    expect(f.sipsTotal).toBe(5000);
    expect(f.left).toBe(50000);
  });
  it('salary day 25 on 27-11: 28 days left, ₹31,358 left → ₹1,119 safe today', () => {
    expect(salaryCycle(25, ref).daysLeft).toBe(28);
    expect(safeToSpend(31358, 28).perDay).toBe(1119);
    const f = cashFlow([mk({ type: 'expense', title: 'Rent', amount: 8642, date: '2026-11-25', category: 'Rent' })], 40000, 25, ref);
    expect(f.left).toBe(31358);
    expect(f.safeToday).toBe(1119);
  });
});

describe('planInvestLog', () => {
  const input = { amount: 5000, date: '2026-11-27', title: 'Axis SIP', kind: 'SIP' as const };
  it('updates the matching live card: invested up, next a month on', () => {
    const card = mk({ type: 'invest', title: 'Axis SIP', amount: 5000, invest: { kind: 'SIP', next: '2026-12-05', invested: 20000 } });
    const other = mk({ type: 'invest', title: 'HDFC SIP', amount: 3000, invest: { kind: 'SIP', next: '2026-12-10' } });
    const p = planInvestLog([card, other], input);
    expect(p).toEqual({ update: card.id, patch: { invest: { kind: 'SIP', next: '2027-01-05', invested: 25000 } } });
  });
  it('uses the only live card of that kind when the name differs', () => {
    const card = mk({ type: 'invest', title: 'Parag Parikh', amount: 5000, invest: { kind: 'SIP' } });
    const p = planInvestLog([card], { ...input, title: 'SIP 5000' });
    expect('update' in p && p.update).toBe(card.id);
    expect('update' in p && p.patch.invest?.next).toBe('2026-12-27');
    expect('update' in p && p.patch.invest?.invested).toBe(5000);
  });
  it('lump sums do not get a next date', () => {
    const fd = mk({ type: 'invest', title: 'SBI FD', amount: 100000, invest: { kind: 'FD', invested: 100000 } });
    const p = planInvestLog([fd], { amount: 50000, date: '2026-11-27', title: 'FD top up', kind: 'FD' });
    expect(p).toEqual({ update: fd.id, patch: { invest: { kind: 'FD', invested: 150000 } } });
  });
  it('creates a new card when none matches (or the match is not live, or two could match)', () => {
    const archived = mk({ type: 'invest', title: 'Axis SIP', status: 'archived', invest: { kind: 'SIP' } });
    const a = mk({ type: 'invest', title: 'A', invest: { kind: 'MF' } });
    const b = mk({ type: 'invest', title: 'B', invest: { kind: 'MF' } });
    const p = planInvestLog([archived, a, b], input);
    expect(p).toEqual({ create: { type: 'invest', title: 'Axis SIP', amount: 5000, invest: { kind: 'SIP', invested: 5000, start: '2026-11-27', next: '2026-12-27' } } });
    const q = planInvestLog([archived, a, b], { amount: 2000, date: '2026-11-27', title: 'Groww', kind: 'MF' });
    expect('create' in q && q.create.invest).toEqual({ kind: 'MF', invested: 2000, start: '2026-11-27' });
  });
});
