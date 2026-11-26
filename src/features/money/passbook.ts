/**
 * The passbook: this salary cycle as ledger lines with a running balance, like a bank passbook.
 * Salary is the opening credit, each spend is a debit, and bills still due before the next salary
 * appear at the top as "due" lines with the balance they will leave. Pure; tested in passbook.test.ts.
 */
import type { Card } from '../../lib/types';
import { isActive } from '../../lib/types';
import { salaryCycle } from './cashflow';
import { isLive } from './money-util';

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

export function passbook(cards: Card[], salary: number, salaryDay: number, ref: Date): { lines: PassLine[]; cycle: { start: string; end: string } } {
  const cyc = salaryCycle(salaryDay, ref);
  const spends = cards
    .filter(c => c.type === 'expense' && isLive(c) && c.date && c.date >= cyc.start && c.date < cyc.end && (c.amount ?? 0) > 0)
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : a.createdAt - b.createdAt));
  const dues = cards
    .filter(c => c.type === 'bill' && isActive(c) && c.due && c.due < cyc.end && (c.amount ?? 0) > 0)
    .sort((a, b) => (a.due! < b.due! ? -1 : 1));

  const has = salary > 0;
  let bal = has ? salary : 0;
  const asc: PassLine[] = [];
  if (has) asc.push({ id: `salary-${cyc.start}`, date: cyc.start, title: 'Salary', sub: 'Credited', amount: salary, balance: bal, kind: 'salary' });
  for (const c of spends) {
    bal -= c.amount!;
    asc.push({
      id: c.id, date: c.date!, title: c.title || c.category || 'Spend',
      sub: [c.category, c.mode].filter(Boolean).join(' · '), amount: -c.amount!, balance: has ? bal : null, kind: 'spend', card: c,
    });
  }
  for (const b of dues) {
    bal -= b.amount!;
    asc.push({
      id: b.id, date: b.due!, title: b.title || 'Bill', sub: b.penalty ? `Due · ${b.penalty}` : 'Due',
      amount: -b.amount!, balance: has ? bal : null, kind: 'due', card: b,
    });
  }
  // Show newest first, with what's still due on top.
  const due = asc.filter(l => l.kind === 'due').reverse();
  const done = asc.filter(l => l.kind !== 'due').reverse();
  return { lines: [...due, ...done], cycle: { start: cyc.start, end: cyc.end } };
}
