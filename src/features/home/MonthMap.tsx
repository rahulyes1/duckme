/** The top of Tracker: the month-end estimate over a tappable map of your days. */
import { ArrowRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '../../app-context';
import type { Card, Settings } from '../../lib/types';
import { fmtDate, fmtMonth, inr, today, todayISO } from '../../lib/format';
import { monthSpend } from '../../lib/logic';
import { monthEstimate, FIRST_ESTIMATE_DAY } from './month-estimate';
import { monthMap, type MapDay } from './month-map';

const label = (d: MapDay) => [
  fmtDate(d.iso),
  d.future ? '' : d.spent ? `spent ${inr(d.spent)}` : 'no spend recorded',
  ...d.bills.map(b => `${b.title || 'Bill'} due`),
  d.salary ? 'salary day' : '',
].filter(Boolean).join(', ');

export function MonthMap({ cards, settings }: { cards: Card[]; settings: Settings }) {
  const app = useApp();
  const iso = todayISO();
  const days = useMemo(() => monthMap(cards, settings, today()), [cards, settings, iso]); // eslint-disable-line react-hooks/exhaustive-deps
  const spent = useMemo(() => monthSpend(cards, today()).total, [cards, iso]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<string>();
  const day = days.find(d => d.iso === picked) ?? days.find(d => d.today)!;
  const est = monthEstimate(spent, today());
  const budget = settings.monthBudget;
  const name = fmtMonth(today()).split(' ')[0];
  const items = [...day.bills.map(c => ({ c, bill: true })), ...day.spends.map(c => ({ c, bill: false }))];

  return (
    <section className="map" aria-label="Month map">
      <a className="map-head" href="#money">
        <span className="map-k">{est && est.daysAfterToday ? `${name} may end at` : `Spent in ${name}`}</span>
        <b className="map-big num">{est && est.daysAfterToday ? `≈ ${inr(est.total)}` : inr(spent)}</b>
        <span className="map-sub num">
          {est ? `${inr(spent)} spent so far` : `Estimate starts on the ${FIRST_ESTIMATE_DAY}th, after your first spend`}
          {est && budget ? ` · ${est.total > budget ? `${inr(est.total - budget)} above` : `${inr(budget - est.total)} within`} budget` : ''}
        </span>
      </a>
      <div className="map-grid" role="group" aria-label="Tap a day to see it">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => <span key={i} className="map-wd" aria-hidden="true">{w}</span>)}
        {days.map(d => (
          <button key={d.iso} type="button" aria-label={label(d)} aria-pressed={d.iso === day.iso} onClick={() => setPicked(d.iso)}
            className={`map-day heat-${d.heat}${d.future ? ' is-future' : ''}${d.today ? ' is-today' : ''}${d.bills.length ? ' has-bill' : ''}${d.salary ? ' has-salary' : ''}`}>
            <span className="num">{d.date}</span>
          </button>
        ))}
      </div>
      <p className="map-key" aria-hidden="true"><span><i className="k-spend" />darker to brighter = more spent</span><span><i className="k-bill" />bill</span>{!!settings.salaryAmount && <span><i className="k-salary" />salary</span>}</p>
      <div className="map-slip" aria-live="polite">
        <div className="map-slip-head">
          <b>{day.today ? 'Today' : fmtDate(day.iso)}</b>
          <span className="num">{day.spent ? inr(day.spent) : day.future ? 'Coming up' : 'No spend recorded'}</span>
        </div>
        {day.salary && <p className="map-pay">Salary day</p>}
        {items.slice(0, 4).map(({ c, bill }) => (
          <button key={c.id} type="button" className="map-line" onClick={() => app.openCard(c.id)}>
            <span>{c.title || c.category || 'Spend'}{bill && <small>bill due</small>}</span><span className="num">{c.amount ? inr(c.amount) : ''}</span>
          </button>
        ))}
        {items.length > 4 && <a className="map-more" href="#money">+{items.length - 4} more in Money <ArrowRight size={14} aria-hidden="true" /></a>}
      </div>
    </section>
  );
}
