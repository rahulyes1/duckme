/** Tracker home, "clean ledger": one big number, a thin running-spend line, then plain rows. */
import { ArrowRight, Plus } from 'lucide-react';
import { useMemo } from 'react';
import type { Card, Settings } from '../../lib/types';
import { inr, today, todayISO, fmtMonth } from '../../lib/format';
import { useCountUp } from '../../lib/hooks';
import { monthSpend, isSpend } from '../../lib/logic';
import { monthIncome } from '../../lib/income';

export function TrackerCards({ cards, settings, onAdd }: { cards: Card[]; settings: Settings; onAdd: (kind: 'expense' | 'income') => void }) {
  const iso = todayISO();
  const month = useMemo(() => monthSpend(cards, today()), [cards, iso]); // eslint-disable-line react-hooks/exhaustive-deps
  const income = useMemo(() => monthIncome(settings, iso.slice(0, 7), today(), cards), [cards, settings, iso]);
  /** Running total for each day of this month so far, drawn from the 1st to today. */
  const line = useMemo(() => {
    const days = Math.max(2, +iso.slice(8));
    const by = Array.from({ length: days }, () => 0);
    for (const c of cards) {
      if (!isSpend(c) || !c.date?.startsWith(iso.slice(0, 7)) || c.date > iso) continue;
      by[+c.date.slice(8) - 1] += c.amount ?? 0;
    }
    let run = 0;
    const totals = by.map(v => (run += v));
    const max = Math.max(1, run);
    return totals.map((v, i) => `${i ? 'L' : 'M'}${((i / (days - 1)) * 300).toFixed(1)} ${(50 - (v / max) * 44).toFixed(1)}`).join(' ');
  }, [cards, iso]);
  const big = useCountUp(month.total, 600);
  const left = income.total - month.total;
  const name = fmtMonth(today()).split(' ')[0];

  return (
    <div className="trk">
      <a className="trk-top" href="#money" aria-label={`Spent this month ${inr(month.total)}. Open Money`}>
        <b className="trk-big num">{inr(big)}</b>
        <span className="trk-k">spent in {name}</span>
        <svg className="trk-line" viewBox="0 0 300 56" preserveAspectRatio="none" aria-hidden="true"><path d={line} /></svg>
      </a>
      <div className="trk-row">
        <span>Income</span>
        <b className="num">{inr(income.total)}</b>
        <button type="button" className="trk-mini" aria-label="Add income" onClick={() => onAdd('income')}><Plus size={18} aria-hidden="true" /></button>
      </div>
      <div className="trk-row">
        <span>Income − spent</span>
        <b className="num">{left < 0 ? '−' : ''}{inr(Math.abs(left))}</b>
      </div>
      {!settings.salaryAmount && <a className="trk-set" href="#money">Set your salary so it counts as income <ArrowRight size={14} aria-hidden="true" /></a>}
    </div>
  );
}
