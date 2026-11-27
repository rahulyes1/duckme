/** Overview tab: the 2-minute money review — payday checklist and the week in money. */
import { motion } from 'framer-motion';
import { CalendarCheck, Flame, PiggyBank, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app-context';
import { saveSettings } from '../../lib/db';
import { fmtDate, fmtDayMonth, inr, prefersReducedMotion, toISO, today } from '../../lib/format';
import { useCountUp } from '../../lib/hooks';
import type { Card, Settings } from '../../lib/types';
import { Money } from '../../ui/bits';
import BudgetSheet from './BudgetSheet';
import { spentByCategory, type CashFlow } from './cashflow';
import { longMonth, monthKey } from './money-util';
import { BillRow } from './parts';
import {
  lastCycleLeftover, liveStreak, paydayKey, parseTicks, reviewedThisWeek, updateStreak, weekSummary, type PaydayStep,
} from './review';
import './split-review.css';

/* ---------- payday checklist ---------- */

function readTicks(key: string): PaydayStep[] {
  try { return parseTicks(localStorage.getItem(key)); } catch { return []; }
}
function writeTicks(key: string, ticks: PaydayStep[]) {
  try { localStorage.setItem(key, JSON.stringify(ticks)); } catch { /* storage blocked: ticks last this session only */ }
}

function LinkRow({ c, right, sub }: { c: Card; right: string; sub: string }) {
  const { openCard } = useApp();
  return (
    <li>
      <button type="button" className="money-rv-link" onClick={e => openCard(c.id, e.currentTarget)}>
        <span className="money-rv-link-t">{c.title || 'Untitled'}</span>
        <span className="money-sub num">{sub}</span>
        <span className="num money-rv-link-a">{right}</span>
      </button>
    </li>
  );
}

export function PaydayCard({ cards, settings, flow }: { cards: Card[]; settings: Settings; flow: CashFlow }) {
  const key = paydayKey(flow.cycle.start);
  const [ticks, setTicks] = useState<PaydayStep[]>(() => readTicks(key));
  const [budgetOpen, setBudgetOpen] = useState(false);
  const closeBudget = useCallback(() => setBudgetOpen(false), []);
  useEffect(() => { setTicks(readTicks(key)); }, [key]);

  const ref = today();
  const month = monthKey(ref);
  const leftover = useMemo(() => lastCycleLeftover(cards, settings.salaryAmount ?? 0, settings.salaryDay, ref),
    [cards, settings.salaryAmount, settings.salaryDay]); // eslint-disable-line react-hooks/exhaustive-deps
  const spent = useMemo(() => spentByCategory(cards, month), [cards, month]);
  const autopays = useMemo(() => {
    const ids = new Set(flow.sips.map(s => s.card.id));
    const auto = cards.filter(c => c.type === 'bill' && c.autopay && (c.status === 'open' || c.status === 'delayed') && !ids.has(c.id));
    return [...flow.sips.map(s => ({ c: s.card, amount: s.amount, date: s.date })), ...auto.map(c => ({ c, amount: c.amount ?? 0, date: c.due ?? '' }))];
  }, [cards, flow.sips]);
  const budgetsSet = Object.values(settings.budgets).filter(v => v > 0).length;

  const toggle = (s: PaydayStep) => {
    const next = ticks.includes(s) ? ticks.filter(t => t !== s) : [...ticks, s];
    setTicks(next);
    writeTicks(key, next);
  };
  const doneCount = ticks.length;

  const step = (s: PaydayStep, title: string, body: React.ReactNode) => {
    const id = `rv-pd-${s}`;
    return (
      <li className={`money-rv-step ${ticks.includes(s) ? 'is-done' : ''}`}>
        <div className="money-rv-check">
          <input id={id} type="checkbox" checked={ticks.includes(s)} onChange={() => toggle(s)} />
          <label htmlFor={id}>{title}</label>
        </div>
        <div className="money-rv-body">{body}</div>
      </li>
    );
  };

  return (
    <section className="money-card money-wide money-rv money-rv-payday" aria-labelledby="rv-pd">
      <div className="money-h-row">
        <h2 id="rv-pd" className="money-h"><CalendarCheck size={18} aria-hidden="true" /> Payday checklist</h2>
        <span className="pill accent num" aria-live="polite">{doneCount} of 4 done</span>
      </div>
      <p className="money-muted">Salary landed on {fmtDate(flow.cycle.start)}. Two minutes now saves a month of worry.</p>
      <ol className="money-rv-steps">
        {step('bills', 'Pay bills due before next salary', flow.bills.length ? (
          <ul className="money-rv-links">
            {flow.bills.map(b => <LinkRow key={b.card.id} c={b.card} right={inr(b.amount)} sub={`Due ${fmtDate(b.date)}`} />)}
          </ul>
        ) : <p className="money-muted">No bills due this cycle.</p>)}
        {step('autopay', 'Confirm SIPs and autopays', autopays.length ? (
          <ul className="money-rv-links">
            {autopays.map(a => <LinkRow key={a.c.id} c={a.c} right={inr(a.amount)} sub={a.date ? fmtDate(a.date) : 'Autopay'} />)}
          </ul>
        ) : <p className="money-muted">No SIPs or autopays this cycle.</p>)}
        {step('save', "Move last month's leftover to savings", (
          <p className="money-muted num">
            {leftover === null ? 'Just tick this once you have moved it.'
              : leftover > 0 ? <>About <b>{inr(leftover)}</b> was left from your last salary. Move it before it gets spent.</>
                : 'Nothing was left last cycle. A smaller budget may help this month.'}
          </p>
        ))}
        {step('budgets', `Set budgets for ${longMonth(ref)}`, (
          <div className="money-rv-inline">
            <span className="money-muted">{budgetsSet ? `${budgetsSet} ${budgetsSet === 1 ? 'budget' : 'budgets'} set` : 'No budgets yet'}</span>
            <button type="button" className="btn ghost" onClick={() => setBudgetOpen(true)}><PiggyBank size={16} aria-hidden="true" /> Budgets</button>
          </div>
        ))}
      </ol>
      <BudgetSheet open={budgetOpen} onClose={closeBudget} settings={settings} spent={spent} monthName={longMonth(ref)} />
    </section>
  );
}

/* ---------- week in money ---------- */

export function WeekCard({ cards, settings, safePerDay, leftNow, onClose }: {
  cards: Card[]; settings: Settings; safePerDay: number; leftNow?: number; onClose?: () => void;
}) {
  const ref = today();
  const iso = toISO(ref);
  const w = useMemo(() => weekSummary(cards, ref, safePerDay, leftNow), [cards, safePerDay, leftNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const already = reviewedThisWeek(settings.lastReviewISO, iso);
  const streak = liveStreak(settings.reviewStreak, settings.lastReviewISO, iso);
  const [celebrate, setCelebrate] = useState(false);
  const shown = Math.round(useCountUp(streak, 300));
  const reduce = prefersReducedMotion();

  const done = async () => {
    const r = updateStreak(settings.reviewStreak, settings.lastReviewISO, iso);
    await saveSettings({ reviewStreak: r.streak, lastReviewISO: iso });
    setCelebrate(true);
  };

  const hasAllowance = w.allowance > 0;
  const frac = hasAllowance ? Math.min(1, w.spent / w.allowance) : 0;
  const over = hasAllowance && w.spent > w.allowance;

  return (
    <section className="money-card money-wide money-rv money-rv-week" aria-labelledby="rv-wk">
      <div className="money-h-row">
        <h2 id="rv-wk" className="money-h"><Sparkles size={18} aria-hidden="true" /> Week in money
          <span className="money-muted num">{fmtDayMonth(w.range.start)} to {fmtDayMonth(w.range.sunday)}</span></h2>
        {onClose && <button type="button" className="icon-btn" aria-label="Close weekly review" onClick={onClose}><X size={18} aria-hidden="true" /></button>}
      </div>

      <div className="money-rv-grid">
        <div className="money-rv-stat">
          <span className="money-k">Spent this week</span>
          <Money value={w.spent} className="money-mid" />
          {hasAllowance ? (
            <>
              <div className={`money-bar ${over ? 'money-rv-over' : ''}`} aria-hidden="true"><i style={{ transform: `scaleX(${frac})` }} /></div>
              <span className="money-sk num">
                {over ? `${inr(w.spent - w.allowance)} over` : `${inr(w.allowance - w.spent)} under`} the {inr(w.allowance)} safe for 7 days
              </span>
            </>
          ) : <span className="money-sk">Add your salary to compare with safe-to-spend.</span>}
        </div>
        <div className="money-rv-stat">
          <span className="money-k">Top category</span>
          <span className="money-rv-val">{w.topCategory ? w.topCategory.name : 'None yet'}</span>
          {w.topCategory && <span className="money-sk num">{inr(w.topCategory.total)}</span>}
        </div>
        <div className="money-rv-stat">
          <span className="money-k">Small spends</span>
          <span className="money-rv-val num">{w.smallCount}</span>
          <span className="money-sk num">{w.smallCount ? `${inr(w.smallTotal)} in payments under ₹200` : 'No small payments'}</span>
        </div>
      </div>

      <h3 className="money-rv-h3">Bills due in the next 7 days {w.billsDue.length > 0 && <span className="num">· {inr(w.billsTotal)}</span>}</h3>
      {w.billsDue.length
        ? <ul className="money-list">{w.billsDue.map(b => <BillRow key={b.id} c={b} salaryDay={settings.salaryDay} />)}</ul>
        : <p className="money-muted">Nothing due this coming week.</p>}

      <div className="money-rv-foot">
        <motion.div className={`money-rv-streak ${celebrate ? 'is-pop' : ''}`} key={celebrate ? 'pop' : 'still'}
          initial={celebrate && !reduce ? { scale: 0.7, opacity: 0.4 } : false} animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.28, ease: [0.3, 1.5, 0.5, 1] }} aria-live="polite">
          <span className="money-rv-flame" aria-hidden="true"><Flame size={20} /></span>
          <span>
            {shown > 0
              ? <><b className="num">{shown}</b> {shown === 1 ? 'Sunday' : 'Sundays'} in a row</>
              : 'Review on Sundays to start a streak'}
            {celebrate && <span className="money-sk">Reviewed. See you next Sunday.</span>}
          </span>
        </motion.div>
        {already || celebrate
          ? <span className="pill accent">Reviewed this week</span>
          : <button type="button" className="btn primary" onClick={() => void done()}>Done reviewing</button>}
      </div>
    </section>
  );
}
