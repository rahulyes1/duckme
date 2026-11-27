import { describe, expect, it } from 'vitest';
import { dayToDate, detectChips, lineAmount, parse, parseAmountToken } from './parse';
import { toISO } from './format';

const REF = new Date(2026, 10, 24); // Tue 24 Nov 2026

describe('parse — Hinglish quick add', () => {
  it('bijli 2400 15th → monthly bill on the next 15th', () => {
    const p = parse('bijli 2400 15th', REF);
    expect(p).toMatchObject({ type: 'bill', amount: 2400, date: '2026-12-15', title: 'Bijli bill', repeat: 'monthly', category: 'Bills' });
  });

  it('rent 18k 5 tareekh → ₹18,000 rent on 5 Dec', () => {
    const p = parse('rent 18k 5 tareekh', REF);
    expect(p).toMatchObject({ type: 'bill', amount: 18000, date: '2026-12-05', title: 'Rent', repeat: 'monthly', category: 'Rent' });
  });

  it('kiraya is titled Rent', () => {
    expect(parse('kiraya 15000', REF).title).toBe('Rent');
  });

  it('chai 40 → Food expense', () => {
    const p = parse('chai 40', REF);
    expect(p).toMatchObject({ type: 'expense', amount: 40, category: 'Food', date: null, title: 'Chai' });
  });

  it('petrol 1500 → Fuel expense', () => {
    expect(parse('petrol 1500', REF)).toMatchObject({ type: 'expense', amount: 1500, category: 'Fuel' });
  });

  it('a bare amount is an expense in Other', () => {
    expect(parse('900', REF)).toMatchObject({ type: 'expense', amount: 900, category: 'Other' });
  });

  it('PUC renew karna kal → task due tomorrow', () => {
    const p = parse('PUC renew karna kal', REF);
    expect(p).toMatchObject({ type: 'task', date: '2026-11-25', amount: null, title: 'PUC renew karna' });
  });

  it('parso → day after tomorrow, aaj → today', () => {
    expect(parse('call mama parso', REF).date).toBe('2026-11-26');
    expect(parse('call mama aaj', REF).date).toBe('2026-11-24');
  });

  it('SIP 3000 10 dec → SIP investment on 10 Dec', () => {
    const p = parse('SIP 3000 10 dec', REF);
    expect(p).toMatchObject({ type: 'invest', investKind: 'SIP', amount: 3000, date: '2026-12-10', title: 'SIP', repeat: 'monthly' });
  });

  it('a named month already past rolls to next year', () => {
    expect(parse('insurance 12000 10 mar', REF).date).toBe('2027-03-10');
    expect(parse('insurance 12000 3rd jan', REF).date).toBe('2027-01-03');
  });

  it('dd/mm dates', () => {
    expect(parse('school fees 25000 15/12', REF)).toMatchObject({ type: 'bill', amount: 25000, date: '2026-12-15', category: 'Education' });
  });

  it('idea: weekend trek → note with prefix removed', () => {
    const p = parse('idea: weekend trek', REF);
    expect(p).toMatchObject({ type: 'note', title: 'Weekend trek', amount: null, date: null });
  });

  it('plain text with nothing to detect is a note', () => {
    expect(parse('buy a new umbrella', REF).type).toBe('note');
  });

  it('amount suffixes: 1.5L, 2 lakh style tokens, 1cr, rs/₹ prefixes', () => {
    expect(parse('gold 1.5L', REF)).toMatchObject({ type: 'invest', investKind: 'Gold', amount: 150000 });
    expect(parseAmountToken('2lakh')).toBe(200000);
    expect(parseAmountToken('1cr')).toBe(1e7);
    expect(parseAmountToken('₹2400')).toBe(2400);
    expect(parseAmountToken('rs.500')).toBe(500);
    expect(parseAmountToken('18K')).toBe(18000);
    expect(parseAmountToken('abc')).toBeNull();
  });

  it('filler words (rs, ka, pe) are dropped from the title', () => {
    expect(parse('doodh ka 60 rs', REF)).toMatchObject({ type: 'expense', amount: 60, title: 'Doodh', category: 'Groceries' });
  });

  it('only the first amount is taken', () => {
    expect(parse('lunch 250 300', REF).amount).toBe(250);
  });

  // Fixed: Indian comma grouping is accepted.
  it('reads "₹2,400" with comma grouping', () => {
    expect(parse('bijli ₹2,400 15th', REF).amount).toBe(2400);
  });
  it('keeps "₹2,400" out of the title', () => {
    const p = parse('bijli ₹2,400 15th', REF);
    expect(p.amount).toBe(2400);
    expect(p.title).toBe('Bijli bill');
  });
});

describe('dayToDate', () => {
  it('today counts as the next occurrence', () => {
    expect(toISO(dayToDate(24, -1, REF))).toBe('2026-11-24');
  });
  it('past day this month rolls to next month', () => {
    expect(toISO(dayToDate(2, -1, REF))).toBe('2026-12-02');
  });
  // BUG (reported): day overflow. "31st" asked in November gives 1 Dec instead of 30 Nov / 31 Dec.
  it('31st from 24 Nov clamps to 30 Nov', () => {
    expect(toISO(dayToDate(31, -1, REF))).not.toBe('2026-12-01');
  });
  it('"31 feb" clamps to the end of February', () => {
    expect(toISO(dayToDate(30, 1, REF))).toBe('2027-02-28');
  });
});

describe('detectChips', () => {
  it('amount + date → bill suggestion', () => {
    expect(detectChips('Pay plumber 1500 on 12th', REF)).toEqual([
      { match: 'Pay plumber 1500 on 12th', amount: 1500, date: '2026-12-12', suggest: 'bill' },
    ]);
  });

  it('date only → task, amount only → expense, one chip per line', () => {
    const chips = detectChips('Call Ramesh kal\nGift ₹5,000\nBuy milk', REF);
    expect(chips).toHaveLength(2);
    expect(chips[0]).toMatchObject({ suggest: 'task', date: '2026-11-25', amount: null });
    expect(chips[1]).toMatchObject({ suggest: 'expense', amount: 5000, date: null });
  });

  it('commas are handled in chips (stripped before parse)', () => {
    expect(detectChips('Rent 18,000 5 tareekh', REF)[0]).toMatchObject({ amount: 18000, date: '2026-12-05', suggest: 'bill' });
  });

  it('plain text gives no chips', () => {
    expect(detectChips('Just thinking about the weekend', REF)).toEqual([]);
  });

  it('caps at 6 chips', () => {
    const text = Array.from({ length: 9 }, (_, i) => `item ${100 + i}`).join('\n');
    expect(detectChips(text, REF)).toHaveLength(6);
  });
});

describe('lineAmount — self-totalling lists', () => {
  it('₹ amounts with commas', () => {
    expect(lineAmount('Gift ₹5,000')).toBe(5000);
    expect(lineAmount('Train tickets ₹ 2,400')).toBe(2400);
  });
  it('bare numbers with 2+ digits', () => {
    expect(lineAmount('Kurta stitching 1800')).toBe(1800);
  });
  it('rs prefix and k suffix', () => {
    expect(lineAmount('Caterer advance rs 1.5k')).toBe(1500);
    expect(lineAmount('Venue 2L')).toBe(200000);
    expect(lineAmount('Gift 5k')).toBe(5000);
    expect(lineAmount('Venue ₹2L')).toBe(200000);
    expect(lineAmount('Venue 12k')).toBe(12000);
  });
  it('ignores years and single digits without ₹', () => {
    expect(lineAmount('Wedding in 2026')).toBeNull();
    expect(lineAmount('Buy 3 sarees')).toBeNull();
    expect(lineAmount('Book a cab')).toBeNull();
  });
  it('a year-like number with ₹ is still money', () => {
    expect(lineAmount('Shoes ₹1999')).toBe(1999);
  });
});

describe('numbers that are not money', () => {
  it('"12 months" is a count, not ₹12', () => {
    expect(parse('Get all 12 months signed', REF).amount).toBeNull();
  });
  it('"₹1 lakh" reads the scale word', () => {
    expect(parse('rent above ₹1 lakh', REF).amount).toBe(100000);
  });
  it('"5 hazaar" reads the scale word', () => {
    expect(parse('shaadi gift 5 hazaar', REF).amount).toBe(5000);
  });
  it('a ₹-marked amount wins over an earlier bare number', () => {
    expect(parse('2 shirts ₹1,200', REF).amount).toBe(1200);
  });
  it('no money chip inside a long sentence without a date', () => {
    const body = 'Needed for the HRA claim. Get all 12 months signed, with his PAN if rent is above ₹1 lakh a year.';
    expect(detectChips(body, REF)).toEqual([]);
  });
  it('short list lines still get an expense chip', () => {
    expect(detectChips('chai 40', REF)[0]).toMatchObject({ amount: 40, suggest: 'expense' });
  });
  it('the plumber line still becomes a bill chip', () => {
    expect(detectChips('Pay plumber 1500 on 12th', REF)[0]).toMatchObject({ amount: 1500, date: '2026-12-12', suggest: 'bill' });
  });
  it('"every month" / "monthly" with an amount is a repeating bill, phrase kept out of the title', () => {
    expect(parse('netflix 649 every month 5th', REF)).toMatchObject({ type: 'bill', title: 'Netflix', repeat: 'monthly', amount: 649 });
    expect(parse('gym 1500 monthly', REF)).toMatchObject({ type: 'bill', title: 'Gym', repeat: 'monthly' });
    expect(parse('12 months ka plan', REF).repeat).toBe('none');
  });
  it('"paid" makes it a spend, not a bill to pay (except card bills)', () => {
    expect(parse('paid rent 18000', REF)).toMatchObject({ type: 'expense', title: 'Rent', amount: 18000 });
    expect(parse('bijli 2400 bhara', REF)).toMatchObject({ type: 'expense', title: 'Bijli bill' });
    expect(parse('paid credit card bill 18450', REF).type).toBe('bill');
  });
  it('drops a stray "due" from the title', () => {
    expect(parse('credit card bill 18,450 due 2 dec', REF)).toMatchObject({ type: 'bill', title: 'Credit card bill', date: '2026-12-02' });
  });
});

describe('identifiers are not money', () => {
  it.each(['Locker no. 42', 'flat 302', 'room 5', 'no. 7', '#42', 'Locker no 42 key lena'])('%s has no amount', t => {
    expect(parse(t, REF).amount).toBeNull();
    expect(parse(t, REF).type).not.toBe('expense');
    expect(detectChips(t, REF)).toEqual([]);
  });
  it('still finds the real amount next to an identifier', () => {
    expect(parse('flat 302 rent 18000', REF).amount).toBe(18000);
    expect(parse('chai ₹20 room 5', REF).amount).toBe(20);
  });
  it('lineAmount ignores identifiers', () => {
    expect(lineAmount('Locker no. 42')).toBeNull();
    expect(lineAmount('flat 302')).toBeNull();
    expect(lineAmount('#42')).toBeNull();
    expect(lineAmount('Locker no. 42 rent 500')).toBe(500);
  });
});
