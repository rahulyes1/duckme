/** Tracker home: the yellow "Spent this month" card with daily bars, and the Income / Expense cards. */
import { ArrowRight, Plus } from 'lucide-react';
import { useMemo } from 'react';
import type { Card, Settings } from '../../lib/types';
import { addDays, inr, toISO, today, todayISO, fmtDayMonth } from '../../lib/format';
import { useCountUp } from '../../lib/hooks';
import { monthSpend, isSpend } from '../../lib/logic';
import { monthIncome } from '../../lib/income';

const DAYS = 15;

export function TrackerCards({ cards, settings, onAdd }: { cards: Card[]; settings: Settings; onAdd: (kind: 'expense' | 'income') => void }) {
  const iso = todayISO();
  const month = useMemo(() => monthSpend(cards, today()), [cards, iso]); // eslint-disable-line react-hooks/exhaustive-deps
  const income = useMemo(() => monthIncome(settings, iso.slice(0, 7), today(), cards), [cards, settings, iso]);
  const bars = useMemo(() => {
    const days = Array.from({ length: DAYS }, (_, i) => toISO(addDays(today(), i - DAYS + 1)));
    const by = new Map(days.map(d => [d, 0]));
    for (const c of cards) if (isSpend(c) && c.date && by.has(c.date)) by.set(c.date, by.get(c.date)! + (c.amount ?? 0));
    return days.map(d => ({ d, v: by.get(d)! }));
  }, [cards, iso]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.max(1, ...bars.map(b => b.v));
  const big = useCountUp(month.total, 600);

  return (
    <div className="trk">
      <a className="trk-hero" href="#money" aria-label={`Spent this month ${inr(month.total)}. Open Money`}>
        <span className="trk-k">Spent this month</span>
        <b className="trk-big num">{inr(big)}</b>
        <span className="trk-bars" role="img" aria-label={`Daily spending, last ${DAYS} days: ${bars.map(b => `${fmtDayMonth(b.d)} ${inr(b.v)}`).join(', ')}`}>
          {bars.map(b => (
            <span key={b.d} className={`trk-bar ${b.d === iso ? 'is-today' : ''}`}>
              <i style={{ height: `${b.v ? Math.max(6, (b.v / max) * 100) : 2}%` }} />
              <small className="num">{+b.d.slice(8)}</small>
            </span>
          ))}
        </span>
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
