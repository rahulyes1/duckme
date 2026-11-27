import { AlertTriangle, ArrowRight, CalendarClock, PartyPopper, Coffee, Lightbulb, Pencil, Sparkles, TrendingDown, TrendingUp, Wallet, Zap } from 'lucide-react';
import { spendingInsights, type InsightKind } from './insights';
import { RecapCard, RecapSheet } from './RecapCard';
import { PaperHero, PassbookList } from './PassbookView';
import { weekAllowance } from './allowance';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { saveSettings } from '../../lib/db';
import { useApp } from '../../app-context';
import { fmtDate, inr, today, fmtDayMonth } from '../../lib/format';
import { monthSpend, netWorth } from '../../lib/logic';
import type { Card, Settings } from '../../lib/types';
import { Money } from '../../ui/bits';
import { cashFlow, spentByCategory, type CashFlow } from './cashflow';
import { longMonth, monthKey, openBills, parseAmount } from './money-util';
import { BillRow, CategoryBar } from './parts';
import { inPaydayWindow, isSunday } from './review';
import { PaydayCard, WeekCard } from './reviewCards';

const INS_ICON: Record<InsightKind, typeof Wallet> = {
  up: TrendingUp, down: TrendingDown, pace: Zap, big: Sparkles, calm: Coffee, weekend: CalendarClock, bills: CalendarClock,
};

/* ---------- weekly allowance ---------- */
function WeekCardAllowance({ cards, allowance }: { cards: Card[]; allowance: number }) {
  const w = weekAllowance(cards, allowance, today());
  const lvl = w.over > 0 ? 'over' : w.frac >= 0.8 ? 'warn' : 'ok';
  return (
    <section className={`money-card money-wk money-lvl-${lvl}`} aria-labelledby="m-wk">
      <div className="money-h-row">
        <h2 id="m-wk" className="money-h">This week</h2>
        <span className="money-muted num">{fmtDayMonth(w.start)} – {fmtDayMonth(w.end)}</span>
      </div>
      <div className="money-wk-row num">
        <div><span className="money-k">{w.over ? 'Over by' : 'Left'}</span><b className="money-wk-big">{inr(w.over || w.left)}</b></div>
        <div><span className="money-k">Per day</span><b className="money-wk-mid">{inr(w.perDay)}</b><small className="money-muted">{w.daysLeft} day{w.daysLeft === 1 ? '' : 's'} left</small></div>
      </div>
      <div className="money-bar" aria-hidden="true"><i style={{ transform: `scaleX(${w.frac})` }} /></div>
      <p className="money-budget num">{inr(w.spent)} of {inr(allowance)} spent</p>
    </section>
  );
}

/* ---------- salary form ---------- */
function SalaryForm({ settings, onDone, compact }: { settings: Settings; onDone?: () => void; compact?: boolean }) {
  const [text, setText] = useState(settings.salaryAmount ? settings.salaryAmount.toLocaleString('en-IN') : '');
  const [day, setDay] = useState(settings.salaryDay || 1);
  const [err, setErr] = useState('');
  const { toast } = useApp();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseAmount(text);
    if (n === null || n <= 0) { setErr('Enter your monthly take-home pay, like 65,000'); return; }
    await saveSettings({ salaryAmount: Math.round(n), salaryDay: day });
    toast('Salary saved');
    onDone?.();
  };
  return (
    <form className="money-salary-form" onSubmit={submit} noValidate
      onKeyDown={e => { if (e.key === 'Escape' && compact && onDone) { e.stopPropagation(); onDone(); } }}>
      <div className="field">
        <label htmlFor="sal-amt">Monthly take-home salary</label>
        <div className="money-rupee-input">
          <span aria-hidden="true">₹</span>
          <input id="sal-amt" className="input num" inputMode="decimal" autoComplete="off" placeholder="65,000" value={text}
            aria-invalid={!!err} aria-describedby={err ? 'sal-err' : 'sal-help'}
            onChange={e => { setText(e.target.value); if (err) setErr(''); }}
            onBlur={e => { const n = parseAmount(e.target.value); if (n !== null) setText(n.toLocaleString('en-IN')); }} />
        </div>
        {err ? <span className="err" id="sal-err" role="alert">{err}</span>
          : <span className="help" id="sal-help">What lands in your account after tax and PF. Private to you.</span>}
      </div>
      <div className="field">
        <label htmlFor="sal-day">Salary credited on</label>
        <select id="sal-day" className="input num" value={day} onChange={e => setDay(Number(e.target.value))}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>Day {d} of the month</option>)}
        </select>
      </div>
      <div className="money-sheet-actions inline">
        {compact && <button type="button" className="btn" onClick={onDone}>Cancel</button>}
        <button type="submit" className="btn primary">Save salary</button>
      </div>
    </form>
  );
}


export default function OverviewTab({ cards, settings, onSpend, onTab }: {
  cards: Card[]; settings: Settings; onSpend: (el?: HTMLElement) => void; onTab: (t: 'expenses' | 'bills' | 'invest') => void;
}) {
  const [editSalary, setEditSalary] = useState(false);
  const [weekOpen, setWeekOpen] = useState(() => isSunday(today()));
  const salary = settings.salaryAmount ?? 0;
  const ref = today();
  const month = monthKey(ref);

  const d = useMemo(() => {
    const flow = cashFlow(cards, salary, settings.salaryDay, ref);
    const byCat = spentByCategory(cards, month);
    const monthTotal = Object.values(byCat).reduce((a, b) => a + b, 0);
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const upcoming = openBills(cards).slice(0, 3);
    const nw = netWorth(cards);
    const inv = cards.filter(c => c.type === 'invest');
    return { flow, byCat, monthSpent: monthSpend(cards, ref).total, monthTotal, top, upcoming, nw, invCount: inv.length };
  }, [cards, salary, settings.salaryDay, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const { flow } = d;
  const [recapOpen, setRecapOpen] = useState(false);
  const insights = useMemo(() => spendingInsights(cards, ref), [cards]); // eslint-disable-line react-hooks/exhaustive-deps
  const daysTxt = flow.cycle.daysLeft === 1 ? '1 day' : `${flow.cycle.daysLeft} days`;
  const gl = d.nw.value - d.nw.invested;
  const payday = salary > 0 && !editSalary && inPaydayWindow(settings.salaryDay, ref);

  return (
    <div className="money-layout">
      {!salary || editSalary ? (
        <section className="money-card money-wide" aria-labelledby="m-sal">
          <h2 id="m-sal" className="money-h"><Wallet size={18} aria-hidden="true" /> {salary ? 'Edit salary' : 'Add your monthly take-home salary'}</h2>
          {!salary && <p className="money-muted">Hisaab then shows what's left after bills and SIPs, and how much is safe to spend each day until the next salary.</p>}
          <SalaryForm settings={settings} compact={!!salary} onDone={() => setEditSalary(false)} />
        </section>
      ) : (
        <PaperHero flow={flow} monthSpent={d.monthSpent} onSpend={onSpend} onEditSalary={() => setEditSalary(true)} />
      )}

      <PassbookList cards={cards} settings={settings} onSpend={onSpend} />

      {payday && <RecapCard cards={cards} settings={settings} />}
      {payday && <PaydayCard cards={cards} settings={settings} flow={flow} />}

      {weekOpen
        ? <WeekCard cards={cards} settings={settings} safePerDay={salary ? flow.safeToday : 0} leftNow={salary ? flow.left : undefined} onClose={isSunday(ref) ? undefined : () => setWeekOpen(false)} />
        : (
          <div className="money-wide money-rv-ask">
            {!payday && <button type="button" className="btn ghost" onClick={() => setRecapOpen(true)}><PartyPopper size={16} aria-hidden="true" /> Last month</button>}
            <button type="button" className="btn" onClick={() => setWeekOpen(true)}><Sparkles size={16} aria-hidden="true" /> Review my week</button>
          </div>
        )}

      {settings.weeklyAllowance ? <WeekCardAllowance cards={cards} allowance={settings.weeklyAllowance} /> : null}

      {insights.length > 0 && (
        <section className="money-card ins-card" aria-labelledby="m-ins">
          <h2 id="m-ins" className="money-h"><Lightbulb size={18} aria-hidden="true" /> Insights</h2>
          <ul className="ins-list">
            {insights.map((x, i) => {
              const Icon = INS_ICON[x.kind];
              return <li key={x.text} className={`ins k-${x.kind}`} style={{ animationDelay: `${i * 60}ms` }}><i aria-hidden="true"><Icon size={16} /></i><span>{x.text}</span></li>;
            })}
          </ul>
        </section>
      )}

      <section className="money-card" aria-labelledby="m-top">
        <div className="money-h-row">
          <h2 id="m-top" className="money-h">Top categories <span className="money-muted">{longMonth(ref)}</span></h2>
          <button type="button" className="btn ghost" onClick={() => onTab('expenses')}>All <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
        {d.top.length ? (
          <ul className="money-cats">
            {d.top.map(([name, amount]) => <CategoryBar key={name} name={name} amount={amount} total={d.monthTotal} budget={settings.budgets[name]} />)}
          </ul>
        ) : <p className="money-muted">Nothing spent yet this month. Tap Spend to add your first expense.</p>}
      </section>


      <section className="money-card" aria-labelledby="m-nw">
        <div className="money-h-row">
          <h2 id="m-nw" className="money-h">Net worth</h2>
          <button type="button" className="btn ghost" onClick={() => onTab('invest')}>Invest <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
        {d.invCount ? (
          <div className="money-inv-tot">
            <div>
              <span className="money-k">Current value</span>
              <Money value={d.nw.value} className="money-mid" />
              <span className="money-sk num">Invested {inr(d.nw.invested)}</span>
            </div>
            <div>
              <span className="money-k">{gl >= 0 ? 'Gain' : 'Loss'}</span>
              <span className={`money-mid num money-gl-${gl >= 0 ? 'up' : 'down'}`}>{gl >= 0 ? '+' : '−'}{inr(Math.abs(gl))}</span>
              <span className="money-sk num">{d.nw.invested ? `${gl >= 0 ? '+' : '−'}${Math.abs((gl / d.nw.invested) * 100).toFixed(1)}%` : 'Add invested amounts'}</span>
            </div>
          </div>
        ) : <p className="money-muted">Add SIPs, FDs or PPF to see your net worth here.</p>}
        <p className="money-note">Values are what you enter. Hisaab doesn't give buy/sell advice.</p>
      </section>
      <RecapSheet open={recapOpen} onClose={() => setRecapOpen(false)} cards={cards} settings={settings} />
    </div>
  );
}

