/**
 * The passbook: this salary cycle as ledger lines with a running balance, like a bank passbook.
 * Salary is the opening credit, each spend is a debit, and bills still due before the next salary
 * appear at the top as "due" lines with the balance they will leave. Pure; tested in passbook.test.ts.
 */
import type { Card, IncomeEntry } from '../../lib/types';
import { toISO } from '../../lib/format';
import { isActive } from '../../lib/types';
import { coveredInstalments, salaryCycle } from './cashflow';
import { isMonthly } from './money-util';
import { isCardPayment, isInvestLog, isSpend } from '../../lib/logic';

export interface PassLine {
  id: string;
  date: string;
  title: string;
  sub: string;
  /** Signed ₹: credit positive, debit negative. */
  amount: number;
  /** Balance after this line (running, oldest → newest). Null when no salary is set. */
  balance: number | null;
  kind: 'salary' | 'spend' | 'due';
  card?: Card;
}

export function passbook(cards: Card[], salary: number, salaryDay: number, ref: Date, incomes: IncomeEntry[] = []): { lines: PassLine[]; cycle: { start: string; end: string } } {
  const cyc = salaryCycle(salaryDay, ref);
  const spends = cards
    // Investment lines stay in the ledger (the money did leave the account), marked as invested, not spent.
    // Card bill payments stay too: cash left the account (a transfer to the card, not a spend).
    .filter(c => (isSpend(c) || isInvestLog(c) || isCardPayment(c)) && c.date && c.date >= cyc.start && c.date < cyc.end && (c.amount ?? 0) > 0)
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : a.createdAt - b.createdAt));
  const dues = cards
    .filter(c => c.type === 'bill' && isActive(c) && c.due && c.due < cyc.end && (c.amount ?? 0) > 0)
    .sort((a, b) => (a.due! < b.due! ? -1 : 1));

  // A SIP already paid by an investment line this cycle shows once (as that line), not again as due.
  const covered = coveredInstalments(cards, cyc.start, cyc.end);
  const sips = cards
    .filter(c => !covered.has(c.id) && c.type === 'invest' && isActive(c) && isMonthly(c.invest?.kind) && c.invest?.next && c.invest.next >= cyc.start && c.invest.next < cyc.end && (c.amount ?? 0) > 0)
    .map(c => ({ c, due: c.invest!.next! }));
  const has = salary > 0;
  let bal = has ? salary : 0;
  const asc: PassLine[] = [];
  if (has) asc.push({ id: `salary-${cyc.start}`, date: cyc.start, title: 'Salary', sub: 'Credited', amount: salary, balance: bal, kind: 'salary' });
  const credits = incomes.filter(i => i.date >= cyc.start && i.date < cyc.end && i.date <= toISO(ref))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  let next = 0;
  const creditUpTo = (date: string) => {
    for (; next < credits.length && credits[next].date <= date; next++) {
      const i = credits[next];
      bal += i.amount;
      asc.push({ id: i.id, date: i.date, title: i.title || 'Income', sub: 'Income', amount: i.amount, balance: has ? bal : null, kind: 'salary' });
    }
  };
  for (const c of spends) {
    creditUpTo(c.date!);
    // A spend on a credit card doesn't touch the account yet: it leaves via the card bill.
    const onCard = isSpend(c) && c.mode === 'Card';
    if (!onCard) bal -= c.amount!;
    const what = isCardPayment(c) ? 'Card bill paid' : isSpend(c) ? c.category : 'Invested';
    asc.push({
      id: c.id, date: c.date!, title: c.title || c.category || 'Spend',
      sub: [what, onCard ? 'On card' : c.mode].filter(Boolean).join(' · '), amount: -c.amount!, balance: has ? bal : null, kind: 'spend', card: c,
    });
  }
  creditUpTo('9999');
  // Bills and SIP/RD instalments still due, soonest first, so the projected balance runs in date order.
  const upcoming = [
    ...dues.map(b => ({ c: b, date: b.due!, title: b.title || 'Bill', sub: b.penalty ? `Due · ${b.penalty}` : 'Due', id: b.id })),
    ...sips.map(({ c, due }) => ({ c, date: due, title: c.title || 'SIP', sub: `${c.invest?.kind ?? 'SIP'} instalment`, id: `sip-${c.id}` })),
  ].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  for (const u of upcoming) {
    bal -= u.c.amount!;
    asc.push({ id: u.id, date: u.date, title: u.title, sub: u.sub, amount: -u.c.amount!, balance: has ? bal : null, kind: 'due', card: u.c });
  }
  const due = asc.filter(l => l.kind === 'due');
  const done = asc.filter(l => l.kind !== 'due').reverse();
  return { lines: [...due, ...done], cycle: { start: cyc.start, end: cyc.end } };
}
