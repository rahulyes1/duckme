import { useMemo } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { Card, Settings } from '../../lib/types';
import { fmtDayMonth, inr, today } from '../../lib/format';
import { useCountUp } from '../../lib/hooks';
import { cashFlow } from '../money/cashflow';
import { spendingInsights } from '../money/insights';
import { linePath, moneyLine } from '../../ui/money-line';

function greeting(h: number): string {
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The top of Home: one clear answer ("how much can I spend today?"), this salary cycle drawn as an
 * ink line that writes itself once, and what is due before the next salary. Tapping opens Money.
 */
export function TodayHero({ cards, settings }: { cards: Card[]; settings: Settings }) {
  const ref = today();
  const salary = settings.salaryAmount ?? 0;
  const flow = useMemo(() => cashFlow(cards, salary, settings.salaryDay, ref), [cards, salary, settings.salaryDay]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = useMemo(() => moneyLine(cards, salary || undefined, settings.salaryDay, ref), [cards, salary, settings.salaryDay]); // eslint-disable-line react-hooks/exhaustive-deps
  const { d, lastX, lastY } = useMemo(() => linePath(line, 1000, 120, 14), [line]);

  const tip = useMemo(() => spendingInsights(cards, ref).find(i => i.kind !== 'bills'), [cards]); // eslint-disable-line react-hooks/exhaustive-deps
  const big = useCountUp(salary ? flow.safeToday : flow.spent, 800);
  const days = flow.cycle.daysLeft;
  const name = settings.userName?.split(' ')[0];

  return (
    <a className={`hero ${flow.overBy ? 'is-over' : ''}`} href="#money" aria-label="Open Money">
      <div className="hero-top">
        <span>{greeting(new Date().getHours())}{name ? `, ${name}` : ''}</span>
        <span className="hero-date">{ref.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </div>

      <div className="hero-k">{salary ? (flow.overBy ? 'Over budget this cycle' : 'Safe to spend today') : 'Spent this cycle'}</div>
      <div className="hero-big num" aria-live="off">
        {salary && flow.overBy ? `−${inr(flow.overBy)}` : inr(big)}
      </div>

      <div className="hero-line" aria-hidden="true">
        <svg viewBox="0 0 1000 120" preserveAspectRatio="none">
          <line x1={lastX} y1={lastY} x2={1000} y2={lastY} className="hl-rest" />
          <path d={d} className={`hl-ink ${line.real ? '' : 'is-neutral'}`} pathLength={1} />
        </svg>
        <span className="hl-dot" style={{ left: `${(lastX / 1000) * 100}%`, top: `${(lastY / 120) * 100}%` }} />
      </div>

      <div className="hero-stats">
        <div>
          <small>Due before salary</small>
          <b className="num">{inr(flow.billsTotal)}</b>
          <em>{flow.bills.length} bill{flow.bills.length === 1 ? '' : 's'}</em>
        </div>
        <div>
          <small>{salary ? 'Left this cycle' : 'Salary'}</small>
          {salary ? <b className="num">{inr(Math.max(0, flow.left))}</b> : <b className="hero-set">Set it <ArrowRight size={14} aria-hidden="true" /></b>}
          <em>{salary ? 'after bills' : 'to see daily limit'}</em>
        </div>
        <div>
          <small>Next salary</small>
          <b className="num">{days === 1 ? 'Tomorrow' : `${days} days`}</b>
          <em>{fmtDayMonth(flow.cycle.end)}</em>
        </div>
      </div>
      {tip && <p className="hero-tip"><Sparkles size={14} aria-hidden="true" /> {tip.text}</p>}
    </a>
  );
}
