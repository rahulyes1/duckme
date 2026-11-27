import { ChevronLeft, ChevronRight, HandCoins, PiggyBank, Search, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app-context';
import { addMonths, fmtDate, fmtMonth, inr, today, todayISO } from '../../lib/format';
import type { Card, Settings } from '../../lib/types';
import { PAY_MODES } from '../../lib/types';
import CategorySheet from './CategorySheet';
import FlowCharts from './FlowCharts';
import BudgetSheet from './BudgetSheet';
import { filterExpenses, groupByDay, spentByCategory, usedCategories } from './cashflow';
import { expensesIn, longMonth, monthKey, monthStart, sum } from './money-util';
import { catIcon, CategoryBar } from './parts';
import { SmallSpendsCard } from './smallSpends';
import { smallInMonth } from './small';
import { splitBalances } from './split';
import { udhaarPeople } from './udhaar';
import { SplitsCard } from './splitCard';
import { UdhaarCard } from './UdhaarCard';
import './goals.css';

/** One expense. Tap to open; delete lives in the editor (with undo), so a stray tap can't remove it. */
function ExpenseRow({ c }: { c: Card }) {
  const { openCard } = useApp();
  const Icon = catIcon(c.category);
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
    </li>
  );
}

export default function ExpensesTab({ cards, settings, month, setMonth, onAdd }: {
  cards: Card[]; settings: Settings; onAdd: (k: 'income' | 'expense') => void;
  /** Shared with the Bills tab (lifted to MoneyScreen). Always the 1st of a month. */
  month: Date; setMonth: (m: Date) => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [mode, setMode] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [allCats, setAllCats] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const closeBudget = useCallback(() => setBudgetOpen(false), []);

  const [extras, setExtras] = useState(false);
  const nowMonth = monthStart(today());
  const key = monthKey(month);
  const isCurrent = key === monthKey(nowMonth);
  const atLatest = key >= monthKey(nowMonth);
  const prevMonth = addMonths(month, -1);

  const d = useMemo(() => {
    const exp = expensesIn(cards, key);
    const spent = sum(exp.map(c => c.amount ?? 0));
    const byCat = spentByCategory(cards, key);
    const names = new Set([...Object.keys(byCat), ...Object.keys(settings.budgets).filter(k => settings.budgets[k] > 0)]);
    const cats = [...names].map(name => ({ name, amount: byCat[name] ?? 0, budget: settings.budgets[name] }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    const used = usedCategories(cards, key);
    const hasSplits = splitBalances(cards).some(b => b.open.length > 0);
    const hasSmall = smallInMonth(cards, key).count > 0;
    return { exp, spent, byCat, cats, used, hasSplits, hasSmall };
  }, [cards, key, settings.budgets]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasUdhaar = useMemo(() => udhaarPeople(settings.udhaar ?? []).some(p => p.open.length > 0), [settings.udhaar]);
  // A category picked from another month may not exist here; drop it so the list never looks empty by mistake.
  useEffect(() => { if (cat && !d.used.includes(cat)) setCat(''); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = filterExpenses(d.exp, { q, category: cat, mode });
  const days = groupByDay(filtered);
  const filtering = !!(q || cat || mode);
  // Category and mode pickers stay tucked away until asked for (or one is in use).
  const showFilters = filtersOpen || !!mode;
  const setShowFilters = (f: (v: boolean) => boolean) => setFiltersOpen(f(showFilters));

  return (
    <>
      <div className="money-month" role="group" aria-label="Month">
        <button type="button" className="icon-btn" aria-label={`Previous month, ${fmtMonth(prevMonth)}`} onClick={() => setMonth(prevMonth)}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span className="money-month-name" aria-live="polite">{fmtMonth(month)}</span>
        <button type="button" className="icon-btn" aria-label={`Next month, ${fmtMonth(addMonths(month, 1))}`} disabled={atLatest}
          onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
        {!isCurrent && <button type="button" className="btn ghost money-this" onClick={() => setMonth(nowMonth)}>This month</button>}
      </div>

      <div className="money-layout">
        <FlowCharts cards={cards} settings={settings} month={month} onAdd={onAdd} />

        <section className="money-card" aria-labelledby="e-cat">
          <div className="money-h-row">
            <h2 id="e-cat" className="money-h">By category</h2>
            <button type="button" className="btn ghost" onClick={() => setBudgetOpen(true)}><PiggyBank size={16} aria-hidden="true" /> Budgets</button>
          </div>
          {d.cats.length ? (<>
            <ul className="money-cats">
              {(allCats ? d.cats : d.cats.slice(0, 3)).map(c => <CategoryBar key={c.name} name={c.name} amount={c.amount} total={d.spent} budget={c.budget}
                onSelect={c.amount > 0 ? setDetail : undefined} />)}
            </ul>
            {d.cats.length > 3 && <button type="button" className="btn ghost money-more-cats" aria-expanded={allCats} onClick={() => setAllCats(v => !v)}>{allCats ? 'Top 3' : `All ${d.cats.length}`}</button>}
          </>) : <p className="money-muted">No spends yet</p>}
        </section>

        <section className="money-card money-wide money-list-card" aria-labelledby="e-list">
          <h2 id="e-list" className="money-h">{cat || 'All spends'}</h2>
          <div className="money-filters">
            <div className="search">
              <Search size={18} aria-hidden="true" />
              <label className="sr-only" htmlFor="e-q">Search expenses</label>
              <input id="e-q" type="search" placeholder="Search spends" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
              {q && <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQ('')}><X size={18} aria-hidden="true" /></button>}
              <button type="button" className={`icon-btn money-filter-btn ${cat || mode ? 'is-on' : ''}`} aria-label="Filter by category or payment mode"
                aria-expanded={showFilters} aria-controls="e-filters" onClick={() => setShowFilters(v => !v)}><SlidersHorizontal size={18} aria-hidden="true" /></button>
            </div>
            {showFilters && <div id="e-filters" className="money-filter-row">
            <div className="field">
              <label htmlFor="e-cat-f">Category</label>
              <select id="e-cat-f" className="input" value={cat} onChange={e => setCat(e.target.value)}>
                <option value="">All categories</option>
                {d.used.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="e-mode-f">Paid with</label>
              <select id="e-mode-f" className="input" value={mode} onChange={e => setMode(e.target.value)}>
                <option value="">Any mode</option>
                {PAY_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            </div>}
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
                {g.items.length > 1 && <span className="num">{inr(g.total)}</span>}
              </h3>
              <ul className="money-list">{g.items.map(c => <ExpenseRow key={c.id} c={c} />)}</ul>
            </div>
          )) : <p className="money-muted">{filtering ? 'Nothing matches these filters.' : 'No spends yet'}</p>}
        </section>

        {(d.hasSplits || extras) && <SplitsCard cards={cards} settings={settings} />}
        {(hasUdhaar || extras) && <UdhaarCard cards={cards} settings={settings} />}
        {(d.hasSmall || extras) && <SmallSpendsCard cards={cards} month={key} monthDate={month} />}
        {!extras && !(d.hasSplits && hasUdhaar) && (
          <button type="button" className="btn ghost money-extras-link money-wide" onClick={() => setExtras(true)}>
            <HandCoins size={16} aria-hidden="true" /> Udhaar & splits
          </button>
        )}
      </div>

      <CategorySheet category={detail} spends={d.exp} period={fmtMonth(month)} onClose={() => setDetail(null)} />
      <BudgetSheet open={budgetOpen} onClose={closeBudget} settings={settings} spent={d.byCat} monthName={longMonth(month)} />
    </>
  );
}
