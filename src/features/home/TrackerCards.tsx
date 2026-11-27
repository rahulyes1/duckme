/** Tracker home: the Month Map, then the Income and Expense tiles. */
import { ArrowRight, Plus } from 'lucide-react';
import { useMemo } from 'react';
import type { Card, Settings } from '../../lib/types';
import { inr, today, todayISO } from '../../lib/format';
import { isSpend } from '../../lib/logic';
import { MonthMap } from './MonthMap';
import { monthIncome } from '../../lib/income';

export function TrackerCards({ cards, settings, onAdd }: { cards: Card[]; settings: Settings; onAdd: (kind: 'expense' | 'income') => void }) {
  const iso = todayISO();
  const spentToday = useMemo(() => cards.reduce((s, c) => s + (isSpend(c) && c.date === iso ? c.amount ?? 0 : 0), 0), [cards, iso]);
  const income = useMemo(() => monthIncome(settings, iso.slice(0, 7), today(), cards), [cards, settings, iso]);

  return (
    <div className="trk">
      <MonthMap cards={cards} settings={settings} />
      <div className="trk-pair">
        {([['income', 'Income', income.total], ['expense', 'Spent today', spentToday]] as const).map(([k, label, v]) => (
          <div key={k} className={`trk-box is-${k}`}>
            <span>{label}</span>
            <button type="button" className="trk-plus" aria-label={k === 'income' ? 'Add income' : 'Add expense'} onClick={() => onAdd(k)}><Plus size={20} strokeWidth={3} aria-hidden="true" /></button>
            <b className="num">{inr(v)}</b>
          </div>
        ))}
      </div>
      {!settings.salaryAmount && <a className="trk-set" href="#money">Set your salary so it counts as income <ArrowRight size={14} aria-hidden="true" /></a>}
    </div>
  );
}
