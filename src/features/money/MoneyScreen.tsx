import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, CalendarClock, Check, ChevronLeft, ChevronRight, IndianRupee, PiggyBank, Plus, Receipt, Repeat2, TrendingUp, Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app-context';
import { payBill } from '../../lib/actions';
import { saveSettings } from '../../lib/db';
import { addDaysISO, addMonths, daysLeft, fmtDate, fmtDateY, fmtMonth, inr, inrShort, nextSalary, salarySide, toISO, today, todayISO } from '../../lib/format';
import { useCards, useSettings } from '../../lib/hooks';
import type { Card, CardType, Settings } from '../../lib/types';
import { EXPENSE_CATEGORIES, KIND_LABEL } from '../../lib/types';
import { DuePill } from '../../ui/CardTile';
import { EmptyState, Money } from '../../ui/bits';
import { Sheet } from '../../ui/Sheet';
import {
  DEFAULTS, expensesIn, hasMaturity, isLive, isMonthly, lastMonths, longMonth, monthKey, monthStart, openBills, paidMessage,
  parseAmount, REPEAT_LABEL, shortMonth, spentIn, sum, YEAR_MULT,
} from './money-util';
import './money.css';
import { isActive } from '../../lib/types';

type AddType = Extract<CardType, 'expense' | 'bill' | 'invest'>;

/* ---------------- add menu ---------------- */
function AddMenu({ onPick }: { onPick: (t: AddType, el: HTMLElement) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), 30);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const items: { t: AddType; label: string; Icon: typeof Plus }[] = [
    { t: 'expense', label: 'Expense', Icon: IndianRupee },
    { t: 'bill', label: 'Bill', Icon: Receipt },
    { t: 'invest', label: 'Investment', Icon: TrendingUp },
  ];
  return (
    <div className="money-add" ref={wrap}>
      <button ref={btn} type="button" className="btn primary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Plus size={18} aria-hidden="true" /> Add
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="money-menu" role="menu" aria-label="Add money entry"
            initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }} transition={{ duration: 0.16 }}
            onKeyDown={e => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
              e.preventDefault();
              const els = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
              const i = els.indexOf(document.activeElement as HTMLElement);
              els[(i + (e.key === 'ArrowDown' ? 1 : els.length - 1)) % els.length]?.focus();
            }}
          >
            {items.map(({ t, label, Icon }) => (
              <button key={t} type="button" role="menuitem" className="money-menu-item"
                onClick={e => { const el = e.currentTarget; setOpen(false); onPick(t, el); }}>
                <Icon size={18} aria-hidden="true" /> {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- budgets sheet ---------------- */
function BudgetSheet({ open, onClose, settings, spent, monthName }: { open: boolean; onClose: () => void; settings: Settings; spent: Record<string, number>; monthName: string }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const v: Record<string, string> = {};
    for (const c of EXPENSE_CATEGORIES) v[c] = settings.budgets[c] ? settings.budgets[c].toLocaleString('en-IN') : '';
    setVals(v); setErr({});
  }, [open, settings.budgets]);

  const save = async () => {
    const budgets: Record<string, number> = {};
    const errs: Record<string, string> = {};
    for (const c of EXPENSE_CATEGORIES) {
      const raw = vals[c] ?? '';
      if (!raw.trim()) continue;
      const n = parseAmount(raw);
      if (n === null || n < 0) errs[c] = 'Enter an amount in rupees, like 5,000';
      else if (n > 0) budgets[c] = Math.round(n);
    }
    setErr(errs);
    if (Object.keys(errs).length) return;
    await saveSettings({ budgets });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Monthly budgets">
      <p className="money-muted">Leave a box empty for no budget. Budgets repeat every month.</p>
      <div className="money-budget-grid">
        {EXPENSE_CATEGORIES.map(c => {
          const id = `budget-${c.replace(/\s/g, '')}`;
          return (
            <div className="field" key={c}>
              <label htmlFor={id}>{c}</label>
              <div className="money-rupee-input">
                <span aria-hidden="true">₹</span>
                <input id={id} className="input num" inputMode="decimal" autoComplete="off" value={vals[c] ?? ''}
                  aria-describedby={`${id}-help${err[c] ? ` ${id}-err` : ''}`} aria-invalid={!!err[c]}
                  onChange={e => setVals(v => ({ ...v, [c]: e.target.value }))}
                  onBlur={e => { const n = parseAmount(e.target.value); if (n !== null) setVals(v => ({ ...v, [c]: n.toLocaleString('en-IN') })); }} />
              </div>
              <span className="help num" id={`${id}-help`}>Spent in {monthName}: {inr(spent[c] ?? 0)}</span>
              {err[c] && <span className="err" id={`${id}-err`}>{err[c]}</span>}
            </div>
          );
        })}
      </div>
      <div className="money-sheet-actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={save}>Save budgets</button>
      </div>
    </Sheet>
  );
}

/* ---------------- trend chart ---------------- */
function Trend({ months, values, selected }: { months: Date[]; values: number[]; selected: string }) {
  const W = 330, H = 170, top = 22, bottom = 26, left = 8, right = 8;
  const max = Math.max(...values, 1);
  const bw = (W - left - right) / months.length;
  const ch = H - top - bottom;
  const avg = sum(values) / values.length;
  const hi = values.indexOf(Math.max(...values));
  const label = months.map((m, i) => `${shortMonth(m)} ${inr(values[i])}`).join(', ');
  const nonZero = values.filter(v => v > 0).length;
  return (
    <figure className="money-trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Spending, last 6 months: ${label}`}>
        {[0, 0.5, 1].map(f => (
          <line key={f} className="money-grid" x1={left} x2={W - right} y1={top + ch * (1 - f)} y2={top + ch * (1 - f)} />
        ))}
        {months.map((m, i) => {
          const h = Math.max(values[i] > 0 ? 3 : 0, (values[i] / max) * ch);
          const x = left + i * bw + bw * 0.18, w = bw * 0.64;
          const cur = monthKey(m) === selected;
          return (
            <g key={i}>
              <rect className={`money-tbar ${cur ? 'cur' : ''}`} x={x} y={top + ch - h} width={w} height={h} rx={5} />
              <text className="money-tval" x={x + w / 2} y={top + ch - h - 6} textAnchor="middle">{values[i] ? inrShort(values[i]) : '₹0'}</text>
              <text className={`money-tlab ${cur ? 'cur' : ''}`} x={x + w / 2} y={H - 8} textAnchor="middle">{shortMonth(m)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="money-muted">
        {nonZero === 0
          ? 'No spending recorded in these six months yet.'
          : <>Average <b className="num">{inr(avg)}</b> a month. Highest was {longMonth(months[hi])} at <b className="num">{inr(values[hi])}</b>.</>}
      </figcaption>
    </figure>
  );
}

/* ---------------- rows ---------------- */
function BillRow({ c, settings }: { c: Card; settings: Settings }) {
  const { openCard, burst, toast } = useApp();
  const side = salarySide(c.due!, settings.salaryDay);
  const pay = async (el: HTMLElement) => {
    const r = await payBill(c.id);
    burst(el);
    toast(paidMessage(c, r.nextDue), r.undo);
  };
  return (
    <li className="money-row money-bill" data-color={c.color}>
      <button type="button" className="money-row-main" onClick={e => openCard(c.id, e.currentTarget)}>
        <span className="money-row-top">
          <span className="money-row-title">{c.title || 'Untitled bill'}</span>
          <span className="money-row-amt num">{c.amount ? inr(c.amount) : 'No amount'}</span>
        </span>
        <span className="money-pills">
          <DuePill due={c.due!} />
          <span className="pill">{fmtDate(c.due!)}</span>
          <span className="pill outline">{side === 'before' ? 'Before salary' : 'After salary'}</span>
          {c.lastSafe && <span className="pill outline">Last safe day {fmtDate(addDaysISO(c.due!, 3))}</span>}
          {c.repeat && c.repeat !== 'none' && <span className="pill"><Repeat2 size={11} aria-hidden="true" />{REPEAT_LABEL[c.repeat]}</span>}
          {c.penalty && <span className="pill pen"><AlertTriangle size={11} aria-hidden="true" />{c.penalty}</span>}
        </span>
      </button>
      <button type="button" className="btn money-paid" aria-label={`Mark ${c.title || 'bill'} paid`} onClick={e => pay(e.currentTarget)}>
        <Check size={16} aria-hidden="true" /> Paid
      </button>
    </li>
  );
}

function MiniRow({ c, right, sub }: { c: Card; right: string; sub?: string }) {
  const { openCard } = useApp();
  return (
    <li>
      <button type="button" className="money-mini" onClick={e => openCard(c.id, e.currentTarget)}>
        <span className="money-mini-text">
          <span className="money-row-title">{c.title || `Untitled ${KIND_LABEL[c.type].toLowerCase()}`}</span>
          {sub && <span className="money-sub">{sub}</span>}
        </span>
        <span className="money-row-amt num">{right}</span>
      </button>
    </li>
  );
}

/* ---------------- screen ---------------- */
export default function MoneyScreen() {
  const { createAndOpen } = useApp();
  const cards = useCards();
  const settings = useSettings();
  const [month, setMonth] = useState<Date>(() => monthStart(today()));
  const [budgetOpen, setBudgetOpen] = useState(false);
  const closeBudget = useCallback(() => setBudgetOpen(false), []);

  const nowMonth = monthStart(today());
  const key = monthKey(month);
  const isCurrent = key === monthKey(nowMonth);
  const prevMonth = addMonths(month, -1);

  const add = (t: AddType, el?: HTMLElement | null) => { void createAndOpen(DEFAULTS[t](), el); };

  const data = useMemo(() => {
    const all = (cards ?? []).filter(isLive);
    const exp = expensesIn(all, key);
    const spent = sum(exp.map(c => c.amount ?? 0));
    const lastSpent = spentIn(all, monthKey(prevMonth));

    const bills = openBills(all);
    const billsThisMonth = bills.filter(b => b.due!.startsWith(key));

    const sal = nextSalary(settings.salaryDay);
    const salISO = toISO(sal);
    const afterEnd = toISO(addMonths(sal, 1));
    const before = bills.filter(b => b.due! < salISO);
    const after = bills.filter(b => b.due! >= salISO && b.due! < afterEnd);

    const byCat: Record<string, number> = {};
    for (const c of exp) { const k = c.category || 'Other'; byCat[k] = (byCat[k] ?? 0) + (c.amount ?? 0); }
    const cats = Array.from(new Set([...Object.keys(byCat), ...Object.keys(settings.budgets).filter(k => settings.budgets[k] > 0)]))
      .map(name => ({ name, amount: byCat[name] ?? 0, budget: settings.budgets[name] }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

    const horizon = addDaysISO(todayISO(), 45);
    const upcoming = bills.filter(b => b.due! <= horizon);

    const subs = all.filter(c => c.type === 'bill' && c.autorenew && isActive(c))
      .sort((a, b) => (a.due ?? '9999') < (b.due ?? '9999') ? -1 : 1);
    const subsYear = sum(subs.map(s => (s.amount ?? 0) * YEAR_MULT[s.repeat ?? 'none']));

    const inv = all.filter(c => c.type === 'invest' && isActive(c));
    const lump = sum(inv.filter(c => !isMonthly(c.invest?.kind)).map(c => c.amount ?? 0));
    const monthly = sum(inv.filter(c => isMonthly(c.invest?.kind)).map(c => c.amount ?? 0));
    const value = sum(inv.map(c => c.invest?.value ?? (isMonthly(c.invest?.kind) ? 0 : c.amount ?? 0)));
    const byKind = new Map<string, Card[]>();
    for (const c of inv) { const k = c.invest?.kind ?? 'Other'; byKind.set(k, [...(byKind.get(k) ?? []), c]); }
    const vault = inv.filter(c => c.invest?.maturity && c.invest.maturity >= todayISO())
      .sort((a, b) => (a.invest!.maturity! < b.invest!.maturity! ? -1 : 1));

    const recent = [...exp].sort((a, b) => (a.date! > b.date! ? -1 : a.date! < b.date! ? 1 : b.createdAt - a.createdAt));
    const days: { date: string; items: Card[] }[] = [];
    for (const c of recent) {
      const last = days[days.length - 1];
      if (last && last.date === c.date) last.items.push(c); else days.push({ date: c.date!, items: [c] });
    }

    const trendMonths = lastMonths(month);
    const trend = trendMonths.map(m => spentIn(all, monthKey(m)));

    const any = all.some(c => c.type === 'expense' || c.type === 'bill' || c.type === 'invest');
    return { spent, lastSpent, billsThisMonth, sal, before, after, cats, byCat, upcoming, subs, subsYear, inv, lump, monthly, value, byKind, vault, days, trendMonths, trend, any };
  }, [cards, key, settings.salaryDay, settings.budgets]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cards) return <div className="screen" />;

  const diff = data.spent - data.lastSpent;
  const prevName = longMonth(prevMonth);
  const vsText = data.spent === 0 && data.lastSpent === 0
    ? `Nothing spent in ${prevName} either`
    : diff === 0 ? `Same as ${prevName}`
      : `${inr(Math.abs(diff))} ${diff < 0 ? 'less' : 'more'} than ${prevName}`;
  const salDays = daysLeft(toISO(data.sal));
  const catTotal = Math.max(data.spent, 1);
  const billsDue = sum(data.billsThisMonth.map(b => b.amount ?? 0));
  const sumBefore = sum(data.before.map(b => b.amount ?? 0));
  const sumAfter = sum(data.after.map(b => b.amount ?? 0));

  return (
    <div className="screen money">
      <header className="topbar">
        <div className="topbar-row">
          <h1 className="screen-title">Money</h1>
          <span style={{ flex: 1 }} />
          <AddMenu onPick={(t, el) => add(t, el)} />
        </div>
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
      </header>

      {!data.any ? (
        <EmptyState icon={<Wallet size={40} aria-hidden="true" />} title="Start your hisaab"
          action={
            <div className="money-empty-actions">
              <button type="button" className="btn primary" onClick={e => add('expense', e.currentTarget)}><IndianRupee size={16} aria-hidden="true" /> Add expense</button>
              <button type="button" className="btn" onClick={e => add('bill', e.currentTarget)}><Receipt size={16} aria-hidden="true" /> Add bill</button>
              <button type="button" className="btn" onClick={e => add('invest', e.currentTarget)}><TrendingUp size={16} aria-hidden="true" /> Add investment</button>
            </div>
          }>
          Add what you spend, the bills coming up and your SIPs or FDs. Everything stays on this device.
        </EmptyState>
      ) : (
        <div className="money-layout">
          {/* summary */}
          <section className="money-summary" aria-label="Summary">
            <div className="money-sum-main">
              <span className="money-k">Spent in {longMonth(month)}</span>
              <Money value={data.spent} className="money-big" />
              <span className="money-vs">{vsText}</span>
            </div>
            <div className="money-sum-side">
              <div>
                <span className="money-k">Bills still due</span>
                <Money value={billsDue} className="money-mid" />
                <span className="money-sk">{data.billsThisMonth.length} {data.billsThisMonth.length === 1 ? 'bill' : 'bills'} in {longMonth(month)}</span>
              </div>
              <div>
                <span className="money-k">Next salary</span>
                <span className="money-mid num">{fmtDate(toISO(data.sal))}</span>
                <span className="money-sk">{salDays === 0 ? 'Today' : salDays === 1 ? 'Tomorrow' : `In ${salDays} days`}</span>
              </div>
            </div>
          </section>

          {/* salary split */}
          <section className="money-card money-split" aria-labelledby="m-split">
            <h2 id="m-split" className="money-h">Bills around salary</h2>
            <div className="money-split-cols">
              <div>
                <span className="money-k">Due before salary ({fmtDate(toISO(data.sal))})</span>
                <Money value={sumBefore} className="money-mid" />
                {data.before.length ? (
                  <ul className="money-list">{data.before.map(b => <MiniRow key={b.id} c={b} right={inr(b.amount)} sub={`${fmtDate(b.due!)}${daysLeft(b.due!) < 0 ? ' · overdue' : ''}`} />)}</ul>
                ) : <p className="money-muted">Nothing due before salary.</p>}
              </div>
              <div>
                <span className="money-k">Due after salary</span>
                <Money value={sumAfter} className="money-mid" />
                {data.after.length ? (
                  <ul className="money-list">{data.after.map(b => <MiniRow key={b.id} c={b} right={inr(b.amount)} sub={fmtDate(b.due!)} />)}</ul>
                ) : <p className="money-muted">Nothing due in the month after salary.</p>}
              </div>
            </div>
          </section>

          {/* categories */}
          <section className="money-card" aria-labelledby="m-cat">
            <div className="money-h-row">
              <h2 id="m-cat" className="money-h">Spending by category</h2>
              <button type="button" className="btn ghost" onClick={() => setBudgetOpen(true)}><PiggyBank size={16} aria-hidden="true" /> Set budgets</button>
            </div>
            {data.cats.length ? (
              <ul className="money-cats">
                {data.cats.map(c => {
                  const pct = Math.round((c.amount / catTotal) * 100);
                  const over = c.budget ? c.amount > c.budget : false;
                  const bfrac = c.budget ? Math.min(1, c.amount / c.budget) : 0;
                  return (
                    <li key={c.name} className="money-cat">
                      <div className="money-cat-top">
                        <span className="money-cat-name">{c.name}</span>
                        <span className="num"><b>{inr(c.amount)}</b> <span className="money-muted">{pct}%</span></span>
                      </div>
                      <div className="money-bar" aria-hidden="true"><i style={{ transform: `scaleX(${c.amount / catTotal})` }} /></div>
                      {!!c.budget && (
                        <div className={`money-budget ${over ? 'over' : ''}`}>
                          <div className="money-bar thin" aria-hidden="true"><i style={{ transform: `scaleX(${bfrac})` }} /></div>
                          <span className="num">
                            {over
                              ? <><AlertTriangle size={13} aria-hidden="true" /> {inr(c.amount - c.budget)} over budget of {inr(c.budget)}</>
                              : <>{inr(c.budget - c.amount)} left of {inr(c.budget)}</>}
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title={`No spending in ${longMonth(month)}`}
                action={<button type="button" className="btn primary" onClick={e => add('expense', e.currentTarget)}><Plus size={16} aria-hidden="true" /> Add expense</button>} />
            )}
          </section>

          {/* upcoming bills */}
          <section className="money-card money-wide" aria-labelledby="m-up">
            <h2 id="m-up" className="money-h">Upcoming bills <span className="money-muted">next 45 days</span></h2>
            {data.upcoming.length ? (
              <ul className="money-list">{data.upcoming.map(b => <BillRow key={b.id} c={b} settings={settings} />)}</ul>
            ) : (
              <EmptyState title="No bills coming up"
                action={<button type="button" className="btn primary" onClick={e => add('bill', e.currentTarget)}><Plus size={16} aria-hidden="true" /> Add bill</button>}>
                Add rent, credit card or EMI dates and Hisaab shows them before and after salary.
              </EmptyState>
            )}
          </section>

          {/* subscriptions */}
          <section className="money-card" aria-labelledby="m-sub">
            <div className="money-h-row">
              <h2 id="m-sub" className="money-h">Subscriptions</h2>
              {!!data.subs.length && <span className="num money-total">{inr(data.subsYear)} a year</span>}
            </div>
            {data.subs.length ? (
              <ul className="money-list">
                {data.subs.map(s => {
                  const r = s.repeat ?? 'none';
                  return <MiniRow key={s.id} c={s}
                    right={`${inr((s.amount ?? 0) * YEAR_MULT[r])}/yr`}
                    sub={`${inr(s.amount)} ${REPEAT_LABEL[r].toLowerCase()}${s.due ? ` · renews ${fmtDate(s.due)}` : ''}`} />;
                })}
              </ul>
            ) : <p className="money-muted">No auto-renewing bills. Turn on "Auto-renews" in a bill to track it here.</p>}
          </section>

          {/* investments */}
          <section className="money-card" aria-labelledby="m-inv">
            <h2 id="m-inv" className="money-h">Investments</h2>
            {data.inv.length ? (
              <>
                <div className="money-inv-tot">
                  <div>
                    <span className="money-k">Invested</span>
                    <Money value={data.lump} className="money-mid" />
                    {data.monthly > 0 && <span className="money-sk num">+ {inr(data.monthly)}/month in SIP and RD</span>}
                  </div>
                  <div>
                    <span className="money-k">Current value</span>
                    <Money value={data.value} className="money-mid" />
                    <span className="money-sk">As you entered it</span>
                  </div>
                </div>
                {[...data.byKind.entries()].map(([kind, list]) => (
                  <div key={kind} className="money-kind">
                    <h3 className="sec-label">{kind}</h3>
                    <ul className="money-list">
                      {list.map(c => {
                        const k = c.invest?.kind;
                        const bits = [
                          isMonthly(k) ? `${inr(c.amount)}/month` : `Invested ${inr(c.amount)}`,
                          isMonthly(k) && c.invest?.next ? `next ${fmtDate(c.invest.next)}` : '',
                          hasMaturity(k) && c.invest?.maturity ? `matures ${fmtDateY(c.invest.maturity)}` : '',
                        ].filter(Boolean).join(' · ');
                        return <MiniRow key={c.id} c={c} right={c.invest?.value !== undefined ? inr(c.invest.value) : 'Add value'} sub={bits} />;
                      })}
                    </ul>
                  </div>
                ))}
                {!!data.vault.length && (
                  <div className="money-vault">
                    <h3 className="sec-label"><CalendarClock size={13} aria-hidden="true" /> Yearly vault · maturities</h3>
                    <ul className="money-list">
                      {data.vault.map(c => {
                        const n = daysLeft(c.invest!.maturity!);
                        return <MiniRow key={c.id} c={c} right={fmtDateY(c.invest!.maturity!)}
                          sub={`${c.invest!.kind} · ${n <= 365 ? `in ${n} days` : `in ${(n / 365).toFixed(1)} years`}`} />;
                      })}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <EmptyState title="No investments yet"
                action={<button type="button" className="btn primary" onClick={e => add('invest', e.currentTarget)}><Plus size={16} aria-hidden="true" /> Add investment</button>}>
                Track SIPs, FDs, PPF, gold and more by hand.
              </EmptyState>
            )}
            <p className="money-note">Values are what you enter. Hisaab doesn't give buy/sell advice.</p>
          </section>

          {/* trend */}
          <section className="money-card" aria-labelledby="m-trend">
            <h2 id="m-trend" className="money-h">Six-month trend</h2>
            <Trend months={data.trendMonths} values={data.trend} selected={key} />
          </section>

          {/* recent */}
          <section className="money-card money-wide" aria-labelledby="m-recent">
            <div className="money-h-row">
              <h2 id="m-recent" className="money-h">Expenses in {longMonth(month)}</h2>
              <button type="button" className="btn ghost" onClick={e => add('expense', e.currentTarget)}><Plus size={16} aria-hidden="true" /> Expense</button>
            </div>
            {data.days.length ? data.days.map(d => (
              <div key={d.date} className="money-day">
                <h3 className="money-day-h">
                  <span>{d.date === todayISO() ? 'Today' : fmtDate(d.date)}</span>
                  <span className="num">{inr(sum(d.items.map(i => i.amount ?? 0)))}</span>
                </h3>
                <ul className="money-list">
                  {d.items.map(c => <MiniRow key={c.id} c={c} right={inr(c.amount)} sub={`${c.category ?? 'Other'} · ${c.mode ?? 'UPI'}`} />)}
                </ul>
              </div>
            )) : <p className="money-muted">No expenses in {longMonth(month)}.</p>}
          </section>
        </div>
      )}

      <BudgetSheet open={budgetOpen} onClose={closeBudget} settings={settings} spent={data.byCat} monthName={longMonth(month)} />
    </div>
  );
}
