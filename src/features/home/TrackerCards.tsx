/** Tracker home: the maroon month-end estimate card, and the Income / Expense cards. */
import { ArrowRight, Plus } from 'lucide-react';
import { useMemo } from 'react';
import type { Card, Settings } from '../../lib/types';
import { inr, today, todayISO, fmtMonth } from '../../lib/format';
import { useCountUp } from '../../lib/hooks';
import { monthSpend } from '../../lib/logic';
import { FIRST_ESTIMATE_DAY, monthEstimate } from './month-estimate';
import { monthIncome } from '../../lib/income';


export function TrackerCards({ cards, settings, onAdd }: { cards: Card[]; settings: Settings; onAdd: (kind: 'expense' | 'income') => void }) {
  const iso = todayISO();
  const month = useMemo(() => monthSpend(cards, today()), [cards, iso]); // eslint-disable-line react-hooks/exhaustive-deps
  const income = useMemo(() => monthIncome(settings, iso.slice(0, 7), today(), cards), [cards, settings, iso]);
  const est = monthEstimate(month.total, today());
  const big = useCountUp(est ? est.total : month.total, 600);
  const budget = settings.monthBudget;
  const name = fmtMonth(today()).split(' ')[0];

  return (
    <div className="trk">
      <a className="trk-hero" href="#money" aria-label={`${est ? `${name} may end at about ${inr(est.total)}. ` : ''}Spent so far ${inr(month.total)}. Open Money`}>
        <span className="trk-k">{est ? (est.daysAfterToday ? `${name} may end at` : `${name} total so far`) : 'Spent this month'}</span>
        <b className="trk-big num">{est && est.daysAfterToday ? '≈ ' : ''}{inr(big)}</b>
        {est ? (
          <>
            <span className="trk-track" aria-hidden="true"><i style={{ width: `${Math.min(100, (month.total / est.total) * 100)}%` }} /></span>
            <span className="trk-legend num">
              <span>{inr(month.total)} spent so far</span>
              <span>{est.daysAfterToday ? `${est.daysAfterToday} ${est.daysAfterToday === 1 ? 'day' : 'days'} after today` : 'Last day'}</span>
            </span>
            <span className="trk-note-line num">
              {budget
                ? (est.total > budget ? `About ${inr(est.total - budget)} above your ${inr(budget)} budget` : `About ${inr(budget - est.total)} within your ${inr(budget)} budget`)
                : `Averaging ${inr(month.total / today().getDate())} a day`}
            </span>
          </>
        ) : <span className="trk-note-line">{month.total > 0 ? `Month-end estimate starts on the ${FIRST_ESTIMATE_DAY}th` : 'Add a spend to see your month-end estimate'}</span>}
      </a>
      <div className="trk-pair">
        {([['income', 'Income', income.total], ['expense', 'Expense', month.total]] as const).map(([k, label, v]) => (
          <div key={k} className={`trk-box is-${k}`}>
            <span>{label}</span>
            <button type="button" className="trk-plus" aria-label={`Add ${label.toLowerCase()}`} onClick={() => onAdd(k)}><Plus size={20} strokeWidth={3} aria-hidden="true" /></button>
            <b className="num">{inr(v)}</b>
          </div>
        ))}
      </div>
      {!settings.salaryAmount && <a className="trk-set" href="#money">Set your salary so it counts as income <ArrowRight size={14} aria-hidden="true" /></a>}
    </div>
  );
}
