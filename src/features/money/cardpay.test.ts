import { describe, expect, it } from 'vitest';
import { billPaymentExpense, newCard } from '../../lib/actions';
import { isCardBill, isSpend, monthTotalsByCategory } from '../../lib/logic';
import type { Card } from '../../lib/types';
import { cashFlow, paidThisCycle, spentByCategory, usedCategories } from './cashflow';
import { spendingInsights } from './insights';
import { expensesIn, spentIn } from './money-util';
import { passbook } from './passbook';
import { monthRecap } from './recap';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const mk = (p: Partial<Card> & { type: Card['type'] }): Card => newCard(p);

/** A ₹500 card spend, then the ₹500 credit-card bill paid the way payBill pays it. */
function scenario() {
  const spend = mk({ type: 'expense', title: 'Swiggy', amount: 500, date: '2026-11-05', category: 'Food', mode: 'Card' });
  const bill = mk({ type: 'bill', title: 'HDFC credit card', amount: 500, due: '2026-11-18', status: 'done', doneAt: d(2026, 11, 15).getTime() });
  const pay = mk(billPaymentExpense(bill, {}, '2026-11-15'));
  bill.links = [pay.id];
  return { spend, bill, pay, cards: [spend, bill, pay] };
}

describe('credit-card bill is a transfer, not a spend', () => {
  it('detects card bills by flag or title', () => {
    expect(isCardBill(mk({ type: 'bill', title: 'Electricity', lastSafe: true }))).toBe(true);
    expect(isCardBill(mk({ type: 'bill', title: 'SBI Card bill' }))).toBe(true);
    expect(isCardBill(mk({ type: 'bill', title: 'Creditcard ICICI' }))).toBe(true);
    expect(isCardBill(mk({ type: 'bill', title: 'Rent' }))).toBe(false);
  });
  it('payment line is marked cardPayment, paid by net banking, and is not a spend', () => {
    const { pay } = scenario();
    expect(pay.cardPayment).toBe(true);
    expect(pay.mode).toBe('Net banking');
    expect(isSpend(pay)).toBe(false);
  });
  it('honours an amount and date override', () => {
    const { bill } = scenario();
    const p = billPaymentExpense(bill, { amount: 300, date: '2026-11-14' }, '2026-11-15');
    expect([p.amount, p.date]).toEqual([300, '2026-11-14']);
    const plain = billPaymentExpense(mk({ type: 'bill', title: 'Rent', amount: 9000 }), {}, '2026-11-15');
    expect(plain.cardPayment).toBeUndefined();
    expect(plain.mode).toBe('UPI');
  });
  it('month spend counts the ₹500 once', () => {
    const { cards } = scenario();
    expect(spentIn(cards, '2026-11')).toBe(500);
    expect(expensesIn(cards, '2026-11')).toHaveLength(1);
    expect(monthTotalsByCategory(cards, '2026-11').total).toBe(500);
    expect(monthRecap(cards, 0, 1, d(2026, 12, 5)).spent).toBe(500);
    expect(spendingInsights(cards, d(2026, 11, 20)).every(i => !/credit card paid/i.test(i.text))).toBe(true);
  });
  it('spentByCategory has no Bills 500, usedCategories skips the payment', () => {
    const { cards } = scenario();
    const by = spentByCategory(cards, '2026-11');
    expect(by.Bills).toBeUndefined();
    expect(by.Food).toBe(500);
    expect(usedCategories(cards, '2026-11')).toEqual(['Food']);
  });
  it('cashFlow: onCard 500, spent 0, and cash left drops once (via the card bill)', () => {
    const { cards } = scenario();
    const f = cashFlow(cards, 50000, 1, d(2026, 11, 20));
    expect(f.onCard).toBe(500);
    expect(f.spent).toBe(0);
    expect(f.cardPaid).toBe(500);
    expect(f.left).toBe(49500);
  });
  it('cashFlow: an unpaid card bill counts in bills, card spend not taken off again', () => {
    const { spend } = scenario();
    const open = mk({ type: 'bill', title: 'HDFC credit card', amount: 500, due: '2026-11-18' });
    const f = cashFlow([spend, open], 50000, 1, d(2026, 11, 10));
    expect(f.billsTotal).toBe(500);
    expect(f.onCard).toBe(500);
    expect(f.left).toBe(49500);
  });
  it('passbook: card spend listed but the balance only drops for the bill payment', () => {
    const { cards } = scenario();
    const { lines } = passbook(cards, 50000, 1, d(2026, 11, 20));
    const last = lines[0];
    expect(last.balance).toBe(49500);
    expect(lines.find(l => l.title === 'Swiggy')?.sub).toContain('paid via card bill');
  });
});

describe('paidThisCycle', () => {
  it('only bills paid inside the current salary cycle, newest first, with the linked amount', () => {
    const { cards, bill } = scenario();
    const older = mk({ type: 'bill', title: 'Old', amount: 100, status: 'done', doneAt: d(2026, 10, 20).getTime() });
    const later = mk({ type: 'bill', title: 'Wifi', amount: 799, status: 'done', doneAt: d(2026, 11, 18).getTime() });
    const partPay = mk(billPaymentExpense(bill, { amount: 450 }, '2026-11-15'));
    bill.links = [partPay.id];
    const open = mk({ type: 'bill', title: 'Open', amount: 50, due: '2026-11-25' });
    const list = paidThisCycle([...cards, partPay, older, later, open], 1, d(2026, 11, 20));
    expect(list.map(p => p.bill.title)).toEqual(['Wifi', 'HDFC credit card']);
    expect(list[1].amount).toBe(450);
    expect(list[1].expense?.id).toBe(partPay.id);
    expect(list[0].amount).toBe(799);
  });
});
