import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BadgeIndianRupee, Sparkles, Sprout } from 'lucide-react';
import type { Card, Settings } from '../../lib/types';
import { inr, today, todayISO } from '../../lib/format';
import { useCountUp } from '../../lib/hooks';
import type { CashFlow } from '../money/cashflow';
import { spendingInsights } from '../money/insights';
import { linePath, moneyLine } from '../../ui/money-line';
import { monthSpend } from '../../lib/logic';
import { salaryJustLanded } from './helpers';

/**
 * The top of Home answers one question: how much can I spend today? One big number, the money left
 * till salary, this cycle drawn as an ink line, and small chips (spent this month, a nudge).
 * Tapping opens Money.
 */
export function TodayHero({ cards, settings, flow }: { cards: Card[]; settings: Settings; flow: CashFlow }) {
  // Re-render when the app comes back to the front, so an app left open overnight shows the new day.
  const [, wake] = useState(0);
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') wake(n => n + 1); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const iso = todayISO();
  const ref = today();
  const salary = settings.salaryAmount ?? 0;
  const line = useMemo(() => moneyLine(cards, salary || undefined, settings.salaryDay, ref), [cards, salary, settings.salaryDay, iso]); // eslint-disable-line react-hooks/exhaustive-deps
  const { d, lastX, lastY } = useMemo(() => linePath(line, 1000, 120, 14), [line]);
  const tip = useMemo(() => spendingInsights(cards, ref).find(i => i.kind !== 'bills'), [cards, iso]); // eslint-disable-line react-hooks/exhaustive-deps
  // Investments (SIP, MF, FD…) are never "spent".
  const month = useMemo(() => monthSpend(cards, ref), [cards, iso]); // eslint-disable-line react-hooks/exhaustive-deps

  const over = salary > 0 && flow.overBy > 0;
  // With a salary: safe to spend today. Without one: what this month cost so far.
  const target = !salary ? month.total : over ? flow.overBy : flow.safeToday;
  const big = useCountUp(target, 800);
  const days = flow.cycle.daysLeft;
  const dayWord = days === 1 ? '1 day' : `${days} days`;
  // First three days after salary: what this month's bills and SIPs will take.
  const landed = salary > 0 && salaryJustLanded(flow.cycle.start, ref);
  const fixed = flow.billsTotal + flow.sipsTotal;

  return (
    <a className={`hero ${over ? 'is-over' : ''}`} href="#money" aria-label="Open Money">
      <div className="hero-top">
        <span className="hero-k">{!salary ? 'Spent this month' : over ? 'Over budget by' : 'Safe to spend today'}</span>
        <span className="hero-date">{ref.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </div>
      <div className="hero-big num" aria-live="off">{inr(big)}</div>
      <p className="hero-sub num">
        {salary
          ? <><b>{inr(Math.max(0, flow.left))}</b> left till salary · {dayWord}</>
          : <span className="hero-set">Set salary for daily limit <ArrowRight size={14} aria-hidden="true" /></span>}
      </p>

      <div className="hero-line" aria-hidden="true">
        <svg viewBox="0 0 1000 120" preserveAspectRatio="none">
          <line x1={lastX} y1={lastY} x2={1000} y2={lastY} className="hl-rest" />
          <path d={d} className={`hl-ink ${line.real ? '' : 'is-neutral'}`} pathLength={1} />
        </svg>
        <span className="hl-dot" style={{ left: `${(lastX / 1000) * 100}%`, top: `${(lastY / 120) * 100}%` }} />
      </div>

      <div className="hero-chips num">
        {landed && <span className="hero-chip is-salary"><BadgeIndianRupee size={13} aria-hidden="true" />Salary in · <b>{inr(fixed)}</b> to bills & SIPs</span>}
        {salary > 0 && <span className="hero-chip"><b>{inr(month.total)}</b> spent this month</span>}
        {month.today > 0 && <span className="hero-chip"><b>{inr(month.today)}</b> today</span>}
        {month.invested > 0 && <span className="hero-chip"><Sprout size={13} aria-hidden="true" /><b>{inr(month.invested)}</b> invested</span>}
        {tip && !landed && <span className="hero-chip is-tip" title={tip.text}><Sparkles size={13} aria-hidden="true" />{tip.short}</span>}
      </div>
    </a>
  );
}
