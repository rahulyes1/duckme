/** Tracker home: the Month Map, then the Income and Expense tiles. */
import { ArrowRight, Plus } from 'lucide-react';
import { useMemo } from 'react';
import type { Card, Settings } from '../../lib/types';
import { inr, today, todayISO } from '../../lib/format';
import { monthSpend } from '../../lib/logic';
import { MonthMap } from './MonthMap';
import { monthIncome } from '../../lib/income';

export function TrackerCards({ cards, settings, onAdd }: { cards: Card[]; settings: Settings; onAdd: (kind: 'expense' | 'income') => void }) {
  const iso = todayISO();
  const month = useMemo(() => monthSpend(cards, today()), [cards, iso]); // eslint-disable-line react-hooks/exhaustive-deps
  const income = useMemo(() => monthIncome(settings, iso.slice(0, 7), today(), cards), [cards, settings, iso]);

  return (
    <div className="trk">
      <MonthMap cards={cards} settings={settings} />
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
