/** Tracker: this month's budget bar. The white line marks today. */
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { fmtMonth, inr, today, todayISO } from '../../lib/format';
import type { Card, Settings } from '../../lib/types';
import BudgetSheet from '../money/BudgetSheet';
import { spentByCategory } from '../money/cashflow';
import { monthPace } from '../money/pace';

export function BudgetPace({ cards, settings }: { cards: Card[]; settings: Settings }) {
  const [open, setOpen] = useState(false);
  const p = monthPace(cards, settings, today());
  return (
    <>
      <button type="button" className="pace" onClick={() => setOpen(true)}>
        {p ? (
          <>
            <span className="pace-row"><b>{p.scope === 'all' ? 'Month budget' : 'Category budgets'}</b><span className="num">{inr(p.spent)} / {inr(p.limit)}</span></span>
            <span className={`pace-bar${p.over ? ' is-over' : ''}`} aria-hidden="true">
              <i style={{ width: `${Math.min(100, p.spentFrac * 100)}%` }} /><s style={{ left: `${p.todayFrac * 100}%` }} />
            </span>
            <span className="pace-row pace-sub num">
              <span>{p.over ? 'Budget crossed' : p.fast ? 'Spending faster than the month' : 'On pace'}</span>
              <span>{p.over ? `${inr(p.over)} over` : `${inr(p.perDay)} a day left`}</span>
            </span>
          </>
        ) : <span className="pace-empty"><b>Set a monthly budget</b><ChevronRight size={18} aria-hidden="true" /></span>}
      </button>
      <BudgetSheet open={open} onClose={() => setOpen(false)} settings={settings} spent={spentByCategory(cards, todayISO().slice(0, 7))} monthName={fmtMonth(today())} />
    </>
  );
}
