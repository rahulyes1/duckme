import { describe, expect, it } from 'vitest';
import type { Card } from './types';
import { guessCategory, parseBankSms, parseSpoken, recurringCandidates, usualSpends } from './capture';

const REF = new Date(2026, 10, 26, 13, 0);

describe('parseBankSms', () => {
  it('HDFC UPI debit', () => {
    const s = parseBankSms('Sent Rs.250.00 From HDFC Bank A/C x1234 To SWIGGY On 25/11/26 Ref 123456789012 Not You? Call 18002586161', REF);
    expect(s).toEqual({ amount: 250, merchant: 'Swiggy', mode: 'UPI', date: '2026-11-25', category: 'Food' });
  });
  it('ICICI card spend', () => {
    const s = parseBankSms('INR 1,299.00 spent using ICICI Bank Card XX4321 on 24-Nov-26 on AMAZON PAY. Avl Limit: INR 45,000.00', REF);
    expect(s?.amount).toBe(1299);
    expect(s?.mode).toBe('Card');
    expect(s?.date).toBe('2026-11-24');
    expect(s?.category).toBe('Shopping');
  });
  it('SBI UPI with VPA', () => {
    const s = parseBankSms('Dear UPI user A/C X5678 debited by 180.0 on date 26Nov26 trf to VPA uber.rides@axisbank Refno 4321. If not u? call 1800111109 -SBI', REF);
    // amount without Rs prefix is not trusted
    expect(s).toBeNull();
    const s2 = parseBankSms('Rs 180 debited from A/C X5678 on 26-11-26 trf to VPA uber.rides@axisbank UPI Ref 4321 -SBI', REF);
    expect(s2?.merchant).toBe('Uber Rides');
    expect(s2?.category).toBe('Travel');
  });
  it('ignores credits and OTPs', () => {
    expect(parseBankSms('Rs.5,000 credited to your A/C x1234 by NEFT from ACME on 01-11-26', REF)).toBeNull();
    expect(parseBankSms('Your OTP for txn of Rs 500 is 123456', REF)).toBeNull();
  });
  it('ATM is cash, NACH is auto-debit', () => {
    expect(parseBankSms('Rs.2000 withdrawn at ATM on 20-11-26 from A/c XX12', REF)?.mode).toBe('Cash');
    expect(parseBankSms('Rs 649 debited towards NACH mandate NETFLIX on 05-11-26', REF)?.mode).toBe('Auto-debit');
  });
});

describe('parseSpoken', () => {
  it('amount + word', () => {
    expect(parseSpoken('250 auto')).toEqual({ amount: 250, title: 'Auto', category: 'Travel', mode: null });
  });
  it('mode and filler words', () => {
    expect(parseSpoken('spent 180 on lunch by card')).toEqual({ amount: 180, title: 'Lunch', category: 'Food', mode: 'Card' });
  });
  it('k and thousand', () => {
    expect(parseSpoken('2.5k groceries from dmart').amount).toBe(2500);
    expect(parseSpoken('1 thousand petrol').category).toBe('Fuel');
  });
  it('rupee words', () => {
    expect(parseSpoken('chai 20 rupees cash')).toEqual({ amount: 20, title: 'Chai', category: 'Food', mode: 'Cash' });
  });
  it('category guesses', () => {
    expect(guessCategory('BESCOM electricity')).toBe('Bills');
    expect(guessCategory('random thing')).toBeNull();
  });
});

const ex = (id: string, date: string, amount: number, title: string, hour = 9, extra: Partial<Card> = {}): Card => ({
  id, type: 'expense', title, body: '', color: 'white', pinned: false, labels: [], horizon: 'none', rank: 1, status: 'open', links: [],
  createdAt: new Date(2026, 10, 1, hour).getTime(), updatedAt: 0, date, amount, category: 'Food', mode: 'UPI', ...extra,
});

describe('usualSpends', () => {
  it('repeats of the same title + amount, best for this hour first', () => {
    const cards = [
      ex('1', '2026-11-20', 20, 'Chai', 9), ex('2', '2026-11-21', 20, 'Chai', 9), ex('3', '2026-11-22', 20, 'Chai', 9),
      ex('4', '2026-11-20', 180, 'Lunch', 13), ex('5', '2026-11-21', 180, 'lunch', 13), ex('6', '2026-11-22', 180, 'Lunch', 13),
      ex('7', '2026-11-22', 999, 'Once', 13),
    ];
    const u = usualSpends(cards, REF);
    expect(u.map(x => x.title)).toEqual(['Lunch', 'Chai']);
  });
  it('ignores bill payments and old ones', () => {
    const cards = [ex('1', '2026-11-20', 500, 'Rent paid'), ex('2', '2026-10-20', 500, 'Rent paid'), ex('3', '2026-09-20', 500, 'Rent paid'),
      ex('4', '2026-01-01', 20, 'Chai'), ex('5', '2026-01-02', 20, 'Chai'), ex('6', '2026-01-03', 20, 'Chai')];
    expect(usualSpends(cards, REF)).toEqual([]);
  });
});

describe('recurringCandidates', () => {
  it('3 months of Netflix with no bill → suggest one', () => {
    const cards = [ex('1', '2026-09-05', 649, 'Netflix'), ex('2', '2026-10-05', 649, 'Netflix'), ex('3', '2026-11-06', 649, 'Netflix')];
    expect(recurringCandidates(cards, REF)).toEqual([{ title: 'Netflix', amount: 649, day: 5, category: 'Food', months: 3 }]);
  });
  it('not when a bill already tracks it, or it stopped', () => {
    const base = [ex('1', '2026-09-05', 649, 'Netflix'), ex('2', '2026-10-05', 649, 'Netflix'), ex('3', '2026-11-06', 649, 'Netflix')];
    const bill = { ...ex('b', '2026-11-06', 649, 'Netflix'), type: 'bill' as const };
    expect(recurringCandidates([...base, bill], REF)).toEqual([]);
    const old = [ex('1', '2026-06-05', 649, 'Gym'), ex('2', '2026-07-05', 649, 'Gym'), ex('3', '2026-08-06', 649, 'Gym')];
    expect(recurringCandidates(old, REF)).toEqual([]);
  });
});

describe('usualSpends vs monthly payments', () => {
  it('a monthly payment is not a usual quick spend', () => {
    const cards = [ex('1', '2026-09-05', 649, 'Netflix'), ex('2', '2026-10-05', 649, 'Netflix'), ex('3', '2026-11-05', 649, 'Netflix')];
    expect(usualSpends(cards, REF)).toEqual([]);
  });
});

import { daySweep, looksDuplicate, parsePenLine } from './capture';

describe('parsePenLine', () => {
  const ref = new Date(2026, 10, 27, 20); // Fri 27-11-2026
  it('amount, word, mode and day', () => {
    expect(parsePenLine('250 auto cash yday', ref)).toEqual({ amount: 250, title: 'Auto', category: 'Travel', mode: 'Cash', date: '2026-11-26' });
  });
  it('kal = yesterday, parso = day before, weekday = last one', () => {
    expect(parsePenLine('chai 20 kal', ref).date).toBe('2026-11-26');
    expect(parsePenLine('chai 20 parso', ref).date).toBe('2026-11-25');
    expect(parsePenLine('movie 500 on monday', ref).date).toBe('2026-11-23');
    expect(parsePenLine('lunch 180 on 24th', ref).date).toBe('2026-11-24');
    expect(parsePenLine('lunch 180', ref).date).toBe('2026-11-27');
  });
  it('learns category and mode from your history', () => {
    const past = [ex('p', '2026-11-20', 300, 'Sharma ji', 9, { category: 'Groceries', mode: 'Cash' })];
    expect(parsePenLine('sharma ji 450', ref, past)).toMatchObject({ amount: 450, category: 'Groceries', mode: 'Cash' });
  });
});

describe('daySweep + duplicates', () => {
  const now = new Date(2026, 10, 26, 21);
  it('usual spends not logged today', () => {
    const cards = [ex('1', '2026-11-20', 20, 'Chai', 9), ex('2', '2026-11-22', 20, 'Chai', 9), ex('3', '2026-11-24', 20, 'Chai', 9), ex('4', '2026-11-26', 180, 'Lunch', 13)];
    const s = daySweep(cards, now);
    expect(s.total).toBe(180);
    expect(s.missed.map(m => m.title)).toEqual(['Chai']);
  });
  it('same amount + category within 10 minutes', () => {
    const c = { ...ex('d', '2026-11-26', 250, 'Swiggy'), createdAt: 1_000_000 };
    expect(looksDuplicate([c], { amount: 250, category: 'Food', date: '2026-11-26' }, 1_000_000 + 5 * 60_000)?.id).toBe('d');
    expect(looksDuplicate([c], { amount: 250, category: 'Food', date: '2026-11-26' }, 1_000_000 + 20 * 60_000)).toBeNull();
  });
});
