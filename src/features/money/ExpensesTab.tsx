import { ChevronLeft, ChevronRight, PiggyBank, Search, Trash2, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useApp } from '../../app-context';
import { trash } from '../../lib/actions';
import { addMonths, fmtDate, fmtMonth, inr, today, todayISO } from '../../lib/format';
import type { Card, Settings } from '../../lib/types';
import { EXPENSE_CATEGORIES, PAY_MODES } from '../../lib/types';
import { Money } from '../../ui/bits';
import BudgetSheet from './BudgetSheet';
import { filterExpenses, groupByDay, spentByCategory } from './cashflow';
import { expensesIn, lastMonths, longMonth, monthKey, monthStart, spentIn, sum } from './money-util';
import { catIcon, CategoryBar, Trend } from './parts';
import { SmallSpendsCard } from './smallSpends';
import { SplitsCard } from './splitCard';

function ExpenseRow({ c }: { c: Card }) {
  const { openCard, toast } = useApp();
  const Icon = catIcon(c.category);
  const del = async () => {
    const undo = await trash(c.id);
    toast(`Deleted ${c.title || 'expense'} ${inr(c.amount)}`, undo);
  };
  return (
    <li className="money-exp">
      <button type="button" className="money-mini" onClick={e => openCard(c.id, e.currentTarget)}>
        <span className="money-ico" aria-hidden="true"><Icon size={18} /></span>
        <span className="money-mini-text">
          <span className="money-row-title">{c.title || c.category || 'Expense'}</span>
          <span className="money-sub">{c.category ?? 'Other'} · {c.mode ?? 'UPI'}{c.split ? ` · Split with ${c.split.people.length}` : ''}</span>
        </span>
        <span className="money-row-amt num">{inr(c.amount)}</span>
      </button>
      <button type="button" className="icon-btn money-del" aria-label={`Delete ${c.title || 'expense'} ${inr(c.amount)}`} onClick={del}>
        <Trash2 size={18} aria-hidden="true" />
      </button>
    </li>
  );
}

export default function ExpensesTab({ cards, settings }: { cards: Card[]; settings: Settings }) {
  const [month, setMonth] = useState<Date>(() => monthStart(today()));
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [mode, setMode] = useState('');
  const [budgetOpen, setBudgetOpen] = useState(false);
  const closeBudget = useCallback(() => setBudgetOpen(false), []);

  const nowMonth = monthStart(today());
  const key = monthKey(month);
  const isCurrent = key === monthKey(nowMonth);
  const prevMonth = addMonths(month, -1);

  const d = useMemo(() => {
    const exp = expensesIn(cards, key);
    const spent = sum(exp.map(c => c.amount ?? 0));
    const lastSpent = spentIn(cards, monthKey(addMonths(month, -1)));
    const byCat = spentByCategory(cards, key);
    const names = new Set([...Object.keys(byCat), ...Object.keys(settings.budgets).filter(k => settings.budgets[k] > 0)]);
    const cats = [...names].map(name => ({ name, amount: byCat[name] ?? 0, budget: settings.budgets[name] }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    const months = lastMonths(month);
    const trend = months.map(m => spentIn(cards, monthKey(m)));
    return { exp, spent, lastSpent, byCat, cats, months, trend };
  }, [cards, key, settings.budgets]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = filterExpenses(d.exp, { q, category: cat, mode });
  const days = groupByDay(filtered);
  const filtering = !!(q || cat || mode);
  const diff = d.spent - d.lastSpent;
  const prevName = longMonth(prevMonth);
  const vsText = d.spent === 0 && d.lastSpent === 0 ? `Nothing spent in ${prevName} either`
    : diff === 0 ? `Same as ${prevName}` : `${inr(Math.abs(diff))} ${diff < 0 ? 'less' : 'more'} than ${prevName}`;

  return (
    <>
      <div className="money-month" role="group" aria-label="Month">
        <button type="button" className="icon-btn" aria-label={`Previous month, ${fmtMonth(prevMonth)}`} onClick={() => setMonth(prevMonth)}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span className="money-month-name" aria-live="polite">{fmtMonth(month)}</span>
        <button type="button" className="icon-btn" aria-label={`Next month, ${fmtMonth(addMonths(month, 1))}`} disabled={isCurrent}
          onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
        {!isCurrent && <button type="button" className="btn ghost money-this" onClick={() => setMonth(nowMonth)}>This month</button>}
      </div>

      <div className="money-layout">
        <section className="money-summary money-wide" aria-label="Month total">
          <div>
            <span className="money-k">Spent in {longMonth(month)}</span>
            <Money value={d.spent} className="money-big" />
            <span className="money-vs">{vsText} · {d.exp.length} {d.exp.length === 1 ? 'entry' : 'entries'}</span>
          </div>
        </section>

        <section className="money-card" aria-labelledby="e-cat">
          <div className="money-h-row">
            <h2 id="e-cat" className="money-h">By category</h2>
            <button type="button" className="btn ghost" onClick={() => setBudgetOpen(true)}><PiggyBank size={16} aria-hidden="true" /> Budgets</button>
          </div>
          {d.cats.length ? (
            <ul className="money-cats">
              {d.cats.map(c => <CategoryBar key={c.name} name={c.name} amount={c.amount} total={d.spent} budget={c.budget} />)}
            </ul>
          ) : <p className="money-muted">No spending in {longMonth(month)}. Set budgets to get a warning at 80%.</p>}
        </section>

        <section className="money-card" aria-labelledby="e-trend">
          <h2 id="e-trend" className="money-h">Six-month trend</h2>
          <Trend months={d.months} values={d.trend} selected={key} />
        </section>

        <SplitsCard cards={cards} settings={settings} />
        <SmallSpendsCard cards={cards} month={key} monthDate={month} />

        <section className="money-card money-wide" aria-labelledby="e-list">
          <h2 id="e-list" className="money-h">Expenses in {longMonth(month)}</h2>
          <div className="money-filters">
            <div className="search">
              <Search size={18} aria-hidden="true" />
              <label className="sr-only" htmlFor="e-q">Search expenses</label>
              <input id="e-q" type="search" placeholder="Search note, category, amount" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
              {q && <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQ('')}><X size={18} aria-hidden="true" /></button>}
            </div>
            <div className="field">
              <label htmlFor="e-cat-f">Category</label>
              <select id="e-cat-f" className="input" value={cat} onChange={e => setCat(e.target.value)}>
                <option value="">All categories</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="e-mode-f">Paid with</label>
              <select id="e-mode-f" className="input" value={mode} onChange={e => setMode(e.target.value)}>
                <option value="">Any mode</option>
                {PAY_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          {filtering && (
            <p className="money-muted num" aria-live="polite">
              {filtered.length} of {d.exp.length} · {inr(sum(filtered.map(c => c.amount ?? 0)))}
              <button type="button" className="btn ghost" onClick={() => { setQ(''); setCat(''); setMode(''); }}>Clear filters</button>
            </p>
          )}
          {days.length ? days.map(g => (
            <div key={g.date} className="money-day">
              <h3 className="money-day-h">
                <span className="num">{g.date === todayISO() ? `Today · ${fmtDate(g.date)}` : fmtDate(g.date)}</span>
                <span className="num">{inr(g.total)}</span>
              </h3>
              <ul className="money-list">{g.items.map(c => <ExpenseRow key={c.id} c={c} />)}</ul>
            </div>
          )) : <p className="money-muted">{filtering ? 'Nothing matches these filters.' : `No expenses in ${longMonth(month)}.`}</p>}
        </section>
      </div>

      <BudgetSheet open={budgetOpen} onClose={closeBudget} settings={settings} spent={d.byCat} monthName={longMonth(month)} />
    </>
  );
}
