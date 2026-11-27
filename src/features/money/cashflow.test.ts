import { describe, expect, it } from 'vitest';
import { newCard } from '../../lib/actions';
import type { Card } from '../../lib/types';
import {
  budgetCrossing, budgetStatus, bucketByDay, cashFlow, dueItemsInRange, filterExpenses, groupByDay, monthGrid, padDisplay, padEval, padHasOp, padPress,
  padValue, quickCategories, safeToSpend, salaryCycle, salaryDate, spentByCategory, toggleFav, usedCategories,
} from './cashflow';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const mk = (p: Partial<Card> & { type: Card['type'] }): Card => newCard(p);

describe('salaryDate', () => {
  it('clamps day 31 to the end of February', () => {
    expect(salaryDate(2026, 1, 31).getDate()).toBe(28);
    expect(salaryDate(2028, 1, 31).getDate()).toBe(29);
  });
  it('handles month overflow into the next year', () => {
    const s = salaryDate(2026, 12, 1);
    expect([s.getFullYear(), s.getMonth()]).toEqual([2027, 0]);
  });
});

describe('salaryCycle', () => {
  it('mid-month: from this month salary to next month salary', () => {
    const c = salaryCycle(1, d(2026, 11, 25));
    expect(c.start).toBe('2026-11-01');
    expect(c.end).toBe('2026-12-01');
    expect(c.daysLeft).toBe(6);
    expect(c.totalDays).toBe(30);
  });
  it('before salary day: cycle started last month', () => {
    const c = salaryCycle(28, d(2026, 11, 25));
    expect(c.start).toBe('2026-10-28');
    expect(c.end).toBe('2026-11-28');
    expect(c.daysLeft).toBe(3);
  });
  it('salary day itself starts a new cycle', () => {
    const c = salaryCycle(25, d(2026, 11, 25));
    expect(c.start).toBe('2026-11-25');
    expect(c.end).toBe('2026-12-25');
  });
  it('wraps across the year and clamps day 31', () => {
    const c = salaryCycle(31, d(2027, 1, 10));
    expect(c.start).toBe('2026-12-31');
    expect(c.end).toBe('2027-01-31');
    const f = salaryCycle(31, d(2027, 2, 10));
    expect(f.end).toBe('2027-02-28');
  });
  it('the day before salary has 1 day left', () => {
    expect(salaryCycle(1, d(2026, 11, 30)).daysLeft).toBe(1);
  });
});

describe('cashFlow', () => {
  const cards: Card[] = [
    mk({ type: 'bill', title: 'Rent', amount: 20000, due: '2026-11-28', status: 'open' }),
    mk({ type: 'bill', title: 'Late card', amount: 3000, due: '2026-11-10', status: 'delayed' }),
    mk({ type: 'bill', title: 'Next month', amount: 999, due: '2026-12-05' }),
    mk({ type: 'bill', title: 'Paid', amount: 5000, due: '2026-11-20', status: 'done' }),
    mk({ type: 'invest', title: 'SIP', amount: 5000, invest: { kind: 'SIP', next: '2026-11-30' } }),
    mk({ type: 'invest', title: 'SIP later', amount: 2000, invest: { kind: 'SIP', next: '2026-12-10' } }),
    mk({ type: 'invest', title: 'FD', amount: 100000, invest: { kind: 'FD', maturity: '2026-11-29' } }),
    mk({ type: 'expense', amount: 1500, date: '2026-11-03', category: 'Food' }),
    mk({ type: 'expense', amount: 500, date: '2026-11-25', category: 'Travel' }),
    mk({ type: 'expense', amount: 700, date: '2026-10-31', category: 'Food' }),
    mk({ type: 'expense', amount: 9999, date: '2026-11-04', status: 'trashed' }),
  ];
  it('salary minus bills, instalments and spending this cycle', () => {
    const f = cashFlow(cards, 60000, 1, d(2026, 11, 25));
    expect(f.billsTotal).toBe(23000);
    expect(f.bills.map(b => b.card.title)).toEqual(['Late card', 'Rent']);
    expect(f.sipsTotal).toBe(5000);
    expect(f.spent).toBe(2000);
    expect(f.left).toBe(60000 - 23000 - 5000 - 2000);
    expect(f.safeToday).toBe(Math.floor(30000 / 6));
    expect(f.overBy).toBe(0);
  });
  it('reports over-by and never a negative safe amount', () => {
    const f = cashFlow(cards, 20000, 1, d(2026, 11, 25));
    expect(f.left).toBe(-10000);
    expect(f.safeToday).toBe(0);
    expect(f.overBy).toBe(10000);
  });
});

describe('safeToSpend', () => {
  it('divides and floors', () => expect(safeToSpend(1000, 3)).toEqual({ perDay: 333, overBy: 0 }));
  it('zero left', () => expect(safeToSpend(0, 3)).toEqual({ perDay: 0, overBy: 0 }));
  it('guards zero days', () => expect(safeToSpend(500, 0).perDay).toBe(500));
});

describe('budgets', () => {
  it('levels', () => {
    expect(budgetStatus(100, undefined).level).toBe('none');
    expect(budgetStatus(799, 1000).level).toBe('ok');
    expect(budgetStatus(800, 1000).level).toBe('warn');
    expect(budgetStatus(1000, 1000)).toMatchObject({ level: 'warn', left: 0, over: 0, pct: 100 });
    expect(budgetStatus(1300, 1000)).toMatchObject({ level: 'over', left: 0, over: 300 });
    expect(budgetStatus(200, 1000)).toMatchObject({ left: 800, pct: 20 });
  });
  it('crossings', () => {
    expect(budgetCrossing(700, 850, 1000)).toBe('warn');
    expect(budgetCrossing(850, 900, 1000)).toBeNull();
    expect(budgetCrossing(900, 1100, 1000)).toBe('over');
    expect(budgetCrossing(100, 1200, 1000)).toBe('over');
    expect(budgetCrossing(1100, 1200, 1000)).toBeNull();
    expect(budgetCrossing(100, 900, undefined)).toBeNull();
  });
  it('spentByCategory skips other months and trash', () => {
    const cards = [
      mk({ type: 'expense', amount: 100, date: '2026-11-01', category: 'Food' }),
      mk({ type: 'expense', amount: 50, date: '2026-11-02' }),
      mk({ type: 'expense', amount: 70, date: '2026-10-02', category: 'Food' }),
      mk({ type: 'expense', amount: 70, date: '2026-11-02', category: 'Food', status: 'trashed' }),
    ];
    expect(spentByCategory(cards, '2026-11')).toEqual({ Food: 100, Other: 50 });
  });
});

describe('quick categories', () => {
  it('favourites, then most used, then the rest, no duplicates', () => {
    const cards = [
      mk({ type: 'expense', amount: 10, date: '2026-11-01', category: 'Travel' }),
      mk({ type: 'expense', amount: 10, date: '2026-11-02', category: 'Travel' }),
      mk({ type: 'expense', amount: 99, date: '2026-11-02', category: 'Groceries' }),
    ];
    const used = usedCategories(cards, '2026-11');
    expect(used).toEqual(['Travel', 'Groceries']);
    const q = quickCategories(['Fuel', 'Travel', 'Nope'], used);
    expect(q.slice(0, 4)).toEqual(['Fuel', 'Travel', 'Groceries', 'Food']);
    expect(q).toHaveLength(14); // every category once (incl. Staff and Investment)
  });
  it('toggleFav adds and removes', () => {
    expect(toggleFav(undefined, 'Food')).toEqual(['Food']);
    expect(toggleFav(['Food', 'Rent'], 'Food')).toEqual(['Rent']);
  });
});

describe('monthGrid', () => {
  it('is Monday-first and whole weeks (Nov 2026 starts on a Sunday)', () => {
    const g = monthGrid(d(2026, 11, 14));
    expect(g).toHaveLength(42);
    expect(g[0]).toEqual({ iso: '2026-10-26', day: 26, inMonth: false });
    expect(g[6]).toEqual({ iso: '2026-11-01', day: 1, inMonth: true });
    expect(g.filter(c => c.inMonth)).toHaveLength(30);
  });
  it('Feb 2027 starts on Monday: 4 weeks exactly', () => {
    const g = monthGrid(d(2027, 2, 1));
    expect(g).toHaveLength(28);
    expect(g[0].iso).toBe('2027-02-01');
  });
});

describe('dueItemsInRange', () => {
  const bill = mk({ type: 'bill', title: 'Card', amount: 4000, due: '2026-11-15', repeat: 'monthly' });
  const once = mk({ type: 'bill', title: 'Once', amount: 100, due: '2026-12-02' });
  const done = mk({ type: 'bill', title: 'Done', amount: 100, due: '2026-12-02', status: 'done' });
  const sip = mk({ type: 'invest', title: 'SIP', amount: 5000, invest: { kind: 'SIP', next: '2026-11-10' } });
  const fd = mk({ type: 'invest', title: 'FD', amount: 50000, invest: { kind: 'FD', maturity: '2026-12-20', value: 54000 } });
  const end31 = mk({ type: 'bill', title: 'EOM', amount: 1, due: '2027-01-31', repeat: 'monthly' });
  const all = [bill, once, done, sip, fd, end31];

  it('projects repeats into a later month and marks them projected', () => {
    const items = dueItemsInRange(all, '2026-12-01', '2027-01-01');
    expect(items.map(i => [i.card.title, i.date, i.projected])).toEqual([
      ['Once', '2026-12-02', false],
      ['SIP', '2026-12-10', true],
      ['Card', '2026-12-15', true],
      ['FD', '2026-12-20', false],
    ]);
    expect(items.find(i => i.kind === 'maturity')!.amount).toBe(54000);
  });
  it('the real due date is not projected', () => {
    const items = dueItemsInRange(all, '2026-11-01', '2026-12-01');
    expect(items.map(i => [i.card.title, i.projected])).toEqual([['SIP', false], ['Card', false]]);
  });
  it('day 31 repeats clamp without drifting', () => {
    const items = dueItemsInRange([end31], '2027-02-01', '2027-04-01');
    expect(items.map(i => i.date)).toEqual(['2027-02-28', '2027-03-31']);
  });
  it('bucketByDay groups', () => {
    const b = bucketByDay(dueItemsInRange([bill, sip], '2026-11-01', '2026-12-01'));
    expect([...b.keys()]).toEqual(['2026-11-10', '2026-11-15']);
  });
});

describe('expense list helpers', () => {
  const a = mk({ type: 'expense', title: 'Swiggy dinner', amount: 450, date: '2026-11-20', category: 'Food', mode: 'UPI' });
  const b = mk({ type: 'expense', title: 'Petrol', amount: 2000, date: '2026-11-21', category: 'Fuel', mode: 'Card' });
  const c = mk({ type: 'expense', title: 'Tea', amount: 20, date: '2026-11-20', category: 'Food', mode: 'Cash' });
  it('filters by text, category and mode', () => {
    expect(filterExpenses([a, b, c], { q: 'swiggy' })).toEqual([a]);
    expect(filterExpenses([a, b, c], { category: 'Food' })).toEqual([a, c]);
    expect(filterExpenses([a, b, c], { mode: 'Card' })).toEqual([b]);
    expect(filterExpenses([a, b, c], { q: '2000' })).toEqual([b]);
  });
  it('groups by day, newest first, with totals', () => {
    const g = groupByDay([a, b, c]);
    expect(g.map(x => [x.date, x.total])).toEqual([['2026-11-21', 2000], ['2026-11-20', 470]]);
  });
});

describe('number pad', () => {
  const type = (keys: string[]) => keys.reduce(padPress, '');
  it('types digits and backspace', () => {
    expect(type(['1', '2', '5', '0'])).toBe('1250');
    expect(type(['1', '2', 'back'])).toBe('1');
    expect(type(['back'])).toBe('');
  });
  it('no leading zeros', () => {
    expect(type(['0', '0', '5'])).toBe('5');
    expect(type(['00'])).toBe('');
    expect(type(['0', '00'])).toBe('0');
  });
  it('00 appends two zeros', () => expect(type(['5', '00'])).toBe('500'));
  it('decimals: one dot, max 2 places', () => {
    expect(type(['.', '5'])).toBe('0.5');
    expect(type(['1', '.', '.', '2', '5', '9'])).toBe('1.25');
    expect(type(['1', '.', '5', '00'])).toBe('1.50');
  });
  it('caps at 8 integer digits', () => expect(type(Array(12).fill('9'))).toBe('99999999'));
  it('ignores junk keys', () => expect(padPress('12', 'x')).toBe('12'));
  it('value and display', () => {
    expect(padValue('')).toBe(0);
    expect(padValue('12.5')).toBe(12.5);
    expect(padDisplay('')).toBe('0');
    expect(padDisplay('125000')).toBe('1,25,000');
    expect(padDisplay('1250.')).toBe('1,250.');
    expect(padDisplay('1250.5')).toBe('1,250.5');
  });
});

describe('number pad sums', () => {
  const type = (keys: string[]) => keys.reduce(padPress, '');
  const typeStr = (s: string) => type(s.split(''));
  it('adds up', () => {
    expect(padEval('300+200+50')).toBe(550);
    expect(padValue(typeStr('300+200+50'))).toBe(550);
    expect(padEval('300+')).toBe(300);
    expect(padEval('1.5+2.25')).toBe(3.75);
    expect(padEval('12.')).toBe(12);
  });
  it('operator after a dot drops the dot', () => expect(type(['1', '2', '.', '+'])).toBe('12+'));
  it('one dot per number', () => {
    expect(typeStr('1.5+2..25')).toBe('1.5+2.25');
    expect(typeStr('1.5+.5')).toBe('1.5+0.5');
  });
  it('max 2 decimals per number', () => {
    expect(typeStr('1.259+3.333')).toBe('1.25+3.33');
    expect(padEval('0.1+0.2')).toBe(0.3);
  });
  it('00 at the start of a number does nothing', () => {
    expect(type(['5', '+', '00'])).toBe('5+');
    expect(type(['5', '+', '0', '0', '7'])).toBe('5+7');
  });
  it('operator on empty does nothing', () => {
    expect(padPress('', '+')).toBe('');
    expect(padPress('', '-')).toBe('');
  });
  it('never negative', () => {
    expect(padEval('100-300')).toBe(0);
    expect(padEval('300-100')).toBe(200);
  });
  it('operator after operator swaps it', () => {
    expect(type(['5', '+', '+'])).toBe('5+');
    expect(type(['5', '+', '-'])).toBe('5-');
    expect(type(['5', '-', '+'])).toBe('5+');
  });
  it('caps each number at 8 digits and the whole sum at 40 chars', () => {
    expect(type([...Array(10).fill('9'), '+', ...Array(10).fill('1')])).toBe('99999999+11111111');
    const long = type(Array(30).fill(['9', '+']).flat());
    expect(long.length).toBeLessThanOrEqual(40);
    expect(padPress('9+'.repeat(20), '5')).toBe('9+'.repeat(20));
  });
  it('= collapses to the total', () => {
    expect(padPress('300+200+50', '=')).toBe('550');
    expect(padPress('1.5+2.25', '=')).toBe('3.75');
    expect(padPress('100-300', '=')).toBe('');
    expect(padPress('300', '=')).toBe('300');
  });
  it('knows a sum', () => {
    expect(padHasOp('300')).toBe(false);
    expect(padHasOp('300+')).toBe(true);
  });
  it('display', () => {
    expect(padDisplay('125000+50')).toBe('1,25,000 + 50');
    expect(padDisplay('500-20.5')).toBe('500 − 20.5');
    expect(padDisplay('300+')).toBe('300 + ');
  });
});
