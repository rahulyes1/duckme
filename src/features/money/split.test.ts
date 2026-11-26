import { describe, expect, it } from 'vitest';
import { newCard } from '../../lib/actions';
import type { Card, SplitInfo } from '../../lib/types';
import {
  balanceText, buildSplit, equalShares, isUpiId, knownPeople, myShare, settleMessage, settleSplit, splitBalances, upiLink,
  validateShares, whatsappLink,
} from './split';

const exp = (amount: number, split: SplitInfo, p: Partial<Card> = {}): Card =>
  newCard({ type: 'expense', title: 'Dinner', amount, date: '2026-11-20', category: 'Food', split, ...p });
const paise = (xs: number[]) => xs.reduce((s, x) => s + Math.round(x * 100), 0);

describe('equalShares', () => {
  it('splits evenly when it divides', () => {
    const r = equalShares(900, ['Rohan', 'Priya']);
    expect(r.me).toBe(300);
    expect(r.people.map(p => p.share)).toEqual([300, 300]);
  });
  it('rounds to paise and the parts add up exactly', () => {
    const r = equalShares(100, ['A', 'B']);
    expect(paise([r.me, ...r.people.map(p => p.share)])).toBe(10000);
    expect(r.people.map(p => p.share)).toEqual([33.34, 33.33]);
    expect(r.me).toBe(33.33);
  });
  it('works for awkward amounts and many people', () => {
    for (const amt of [0.01, 1, 99.99, 1000.07, 12345.67]) {
      const r = equalShares(amt, ['A', 'B', 'C', 'D', 'E', 'F']);
      expect(paise([r.me, ...r.people.map(p => p.share)])).toBe(Math.round(amt * 100));
    }
  });
});

describe('myShare / validateShares', () => {
  it('my share is what is left', () => {
    expect(myShare(1000, { paidBy: 'me', people: [{ name: 'A', share: 250.5, settled: false }] })).toBe(749.5);
  });
  it('never negative', () => {
    expect(myShare(100, { paidBy: 'me', people: [{ name: 'A', share: 150, settled: false }] })).toBe(0);
  });
  it('rejects shares above the amount', () => {
    expect(validateShares(500, [300, 300])).toMatch(/more than/);
    expect(validateShares(500, [250, 250])).toBeNull();
    expect(validateShares(500, [-1])).toMatch(/0 or more/);
  });
});

describe('buildSplit', () => {
  it('equal split by default, I paid', () => {
    const r = buildSplit(1200, { people: ['Rohan', 'Priya'], custom: null, paidBy: 'me' });
    expect(r.split).toEqual({ paidBy: 'me', people: [{ name: 'Rohan', share: 400, settled: false }, { name: 'Priya', share: 400, settled: false }] });
  });
  it('custom shares and a friend paid', () => {
    const r = buildSplit(1000, { people: ['Rohan', 'Priya'], custom: { Rohan: 600 }, paidBy: 'rohan' });
    expect(r.split?.paidBy).toBe('Rohan');
    expect(r.split?.people[0].share).toBe(600);
    expect(r.split?.people[1].share).toBe(333.33);
  });
  it('errors with no people or too-large shares', () => {
    expect(buildSplit(100, { people: [], custom: null, paidBy: 'me' }).error).toBeTruthy();
    expect(buildSplit(100, { people: ['A'], custom: { A: 150 }, paidBy: 'me' }).error).toMatch(/more than/);
  });
  it('unknown payer falls back to me', () => {
    expect(buildSplit(100, { people: ['A'], custom: null, paidBy: 'Zed' }).split?.paidBy).toBe('me');
  });
});

describe('splitBalances', () => {
  const cards = [
    exp(1200, { paidBy: 'me', people: [{ name: 'Rohan', share: 400, settled: false }, { name: 'Priya', share: 400, settled: false }] }),
    exp(900, { paidBy: 'Priya', people: [{ name: 'Priya', share: 300, settled: false }, { name: 'Rohan', share: 300, settled: false }] }, { title: 'Groceries' }),
    exp(500, { paidBy: 'me', people: [{ name: 'rohan ', share: 250, settled: true }] }),
  ];
  it('nets what they owe me against what I owe them', () => {
    const b = splitBalances(cards);
    const rohan = b.find(x => x.name === 'Rohan')!;
    const priya = b.find(x => x.name === 'Priya')!;
    expect(rohan.net).toBe(400); // Priya paid the groceries: Rohan owes Priya, not me
    expect(rohan.open).toHaveLength(1);
    expect(rohan.settled).toHaveLength(1);
    expect(priya.net).toBe(400 - 300); // she owes me 400, I owe her my 300 share
    expect(balanceText(rohan)).toBe('Rohan owes you ₹400');
  });
  it('I owe a friend who paid', () => {
    const b = splitBalances([exp(600, { paidBy: 'Asha', people: [{ name: 'Asha', share: 300, settled: false }] })]);
    expect(b[0].net).toBe(-300);
    expect(balanceText(b[0])).toBe('You owe Asha ₹300');
  });
  it('ignores trashed expenses', () => {
    const t = exp(600, { paidBy: 'me', people: [{ name: 'A', share: 300, settled: false }] }, { status: 'trashed' });
    expect(splitBalances([t])).toEqual([]);
  });
  it('settleSplit marks only that person', () => {
    const s = settleSplit(cards[0].split!, 'rohan');
    expect(s.people.map(p => p.settled)).toEqual([true, false]);
  });
});

describe('settle-up links', () => {
  it('builds an encoded UPI link', () => {
    expect(upiLink('me@okhdfc', 'Rahul K', 1240)).toBe('upi://pay?pa=me%40okhdfc&pn=Rahul%20K&am=1240.00&cu=INR&tn=Hisaab%20settle');
  });
  it('message lists items, total and the pay link', () => {
    const b = splitBalances([exp(800, { paidBy: 'me', people: [{ name: 'Rohan', share: 400, settled: false }] })])[0];
    const m = settleMessage(b, { id: 'me@upi', name: 'Me' });
    expect(m).toContain('Dinner (20-11-2026): your share ₹400');
    expect(m).toContain('Total you owe me: ₹400');
    expect(m).toContain('upi://pay?pa=me%40upi');
    expect(whatsappLink(m)).toMatch(/^https:\/\/wa\.me\/\?text=Hi%20Rohan/);
  });
  it('no pay link when I owe them', () => {
    const b = splitBalances([exp(800, { paidBy: 'Rohan', people: [{ name: 'Rohan', share: 400, settled: false }] })])[0];
    const m = settleMessage(b, { id: 'me@upi' });
    expect(m).toContain('Total I owe you: ₹400');
    expect(m).not.toContain('upi://');
  });
  it('checks UPI IDs', () => {
    expect(isUpiId('rahul.k@okaxis')).toBe(true);
    expect(isUpiId('rahul')).toBe(false);
  });
  it('knownPeople merges saved and past names without duplicates', () => {
    const c = exp(100, { paidBy: 'me', people: [{ name: 'rohan', share: 50, settled: false }, { name: 'Asha', share: 25, settled: false }] });
    expect(knownPeople(['Rohan', 'Priya'], [c])).toEqual(['Rohan', 'Priya', 'Asha']);
  });
});
