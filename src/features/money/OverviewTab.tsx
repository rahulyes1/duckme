import { AlertTriangle, ArrowRight, CalendarClock, PartyPopper, Coffee, Pencil, Sparkles, TrendingDown, TrendingUp, Wallet, Zap } from 'lucide-react';
import { spendingInsights, type InsightKind } from './insights';
import { RecapCard, RecapSheet } from './RecapCard';
import { PaperHero, PassbookList } from './PassbookView';
import { weekAllowance } from './allowance';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { saveSettings } from '../../lib/db';
import { useApp } from '../../app-context';
import { fmtDate, inr, today, todayISO, fmtDayMonth } from '../../lib/format';
import { monthSpend } from '../../lib/logic';
import StatsDonut from './StatsDonut';
import type { Card, Settings } from '../../lib/types';
import { InfoTip } from '../../ui/InfoTip';
import { cashFlow, type CashFlow } from './cashflow';
import { longMonth, parseAmount } from './money-util';
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
        <label htmlFor="sal-amt">Take-home salary</label>
        <div className="money-rupee-input">
          <span aria-hidden="true">₹</span>
          <input id="sal-amt" className="input num" inputMode="decimal" autoComplete="off" placeholder="65,000" value={text}
            aria-invalid={!!err} aria-describedby={err ? 'sal-err' : 'sal-help'}
            onChange={e => { setText(e.target.value); if (err) setErr(''); }}
            onBlur={e => { const n = parseAmount(e.target.value); if (n !== null) setText(n.toLocaleString('en-IN')); }} />
        </div>
        {err ? <span className="err" id="sal-err" role="alert">{err}</span>
          : <span className="help" id="sal-help">After tax and PF. Stays private.</span>}
      </div>
      <div className="field">
        <label htmlFor="sal-day">Credited on</label>
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


export default function OverviewTab({ cards, settings, onSpend }: {
  cards: Card[]; settings: Settings; onSpend: (el?: HTMLElement) => void;
}) {
  const [editSalary, setEditSalary] = useState(false);
  const [weekOpen, setWeekOpen] = useState(() => isSunday(today()));
  const salary = settings.salaryAmount ?? 0;
  const ref = today();
  const iso = todayISO();

  const d = useMemo(() => {
    const flow = cashFlow(cards, salary, settings.salaryDay, ref, settings.incomes);
    return { flow, monthSpent: monthSpend(cards, ref).total };
  }, [cards, salary, settings.salaryDay, settings.incomes, iso]); // eslint-disable-line react-hooks/exhaustive-deps

  const { flow } = d;
  const [recapOpen, setRecapOpen] = useState(false);
  const insights = useMemo(() => spendingInsights(cards, ref), [cards]); // eslint-disable-line react-hooks/exhaustive-deps
  const daysTxt = flow.cycle.daysLeft === 1 ? '1 day' : `${flow.cycle.daysLeft} days`;
  const payday = salary > 0 && !editSalary && inPaydayWindow(settings.salaryDay, ref);

  return (
    <div className="money-layout">
      <StatsDonut cards={cards} />

      {!salary || editSalary ? (
        <section className="money-card money-wide" aria-labelledby="m-sal">
          <h2 id="m-sal" className="money-h"><Wallet size={18} aria-hidden="true" /> {salary ? 'Edit salary' : 'Your monthly salary'}</h2>
          {!salary && <InfoTip label="Why salary?">Shows what's left after bills and SIPs, and what's safe to spend each day till next salary.</InfoTip>}
          <SalaryForm settings={settings} compact={!!salary} onDone={() => setEditSalary(false)} />
        </section>
      ) : (
        <PaperHero flow={flow} monthSpent={d.monthSpent} onEditSalary={() => setEditSalary(true)} />
      )}

      <PassbookList cards={cards} settings={settings} onSpend={onSpend} />

      {payday && <RecapCard cards={cards} settings={settings} />}
      {payday && <PaydayCard cards={cards} settings={settings} flow={flow} />}

      {weekOpen
        ? <WeekCard cards={cards} settings={settings} safePerDay={salary ? flow.safeToday : 0} leftNow={salary ? flow.left : undefined} onClose={isSunday(ref) ? undefined : () => setWeekOpen(false)} />
        : (
          <div className="money-wide money-rv-ask">
            {!payday && <button type="button" className="btn ghost" onClick={() => setRecapOpen(true)}><PartyPopper size={16} aria-hidden="true" /> Last month</button>}
            <button type="button" className="btn" onClick={() => setWeekOpen(true)}><Sparkles size={16} aria-hidden="true" /> Week review</button>
          </div>
        )}

      {settings.weeklyAllowance ? <WeekCardAllowance cards={cards} allowance={settings.weeklyAllowance} /> : null}

      {insights.length > 0 && (
        <section className="money-card ins-card" aria-label="Insight">
          <ul className="ins-list">
            {insights.slice(0, 1).map((x, i) => {
              const Icon = INS_ICON[x.kind];
              return <li key={x.text} className={`ins k-${x.kind}`} style={{ animationDelay: `${i * 60}ms` }}><i aria-hidden="true"><Icon size={16} /></i><span>{x.text}</span></li>;
            })}
          </ul>
        </section>
      )}

      <RecapSheet open={recapOpen} onClose={() => setRecapOpen(false)} cards={cards} settings={settings} />
    </div>
  );
}

