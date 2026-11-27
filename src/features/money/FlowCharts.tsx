/** General: Income and Expense cards with monthly bars, and the income you added this month. */
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../app-context';
import { getSettings, saveSettings } from '../../lib/db';
import { fmtDayMonth, fmtMonth, inr, inrShort, today } from '../../lib/format';
import { monthIncome } from '../../lib/income';
import type { Card, IncomeEntry, Settings } from '../../lib/types';
import { lastMonths, monthKey, shortMonth, spentIn } from './money-util';

function FlowCard({ kind, label, month, months, values, onAdd }: {
  kind: 'income' | 'expense'; label: string; month: Date; months: Date[]; values: number[]; onAdd: () => void;
}) {
  const max = Math.max(1, ...values);
  return (
    <section className={`flow is-${kind}`} aria-label={label}>
      <div className="flow-top">
        <span>{label} · {fmtMonth(month)}<b className="num">{inr(values[values.length - 1])}</b></span>
        <button type="button" className="trk-plus" aria-label={`Add ${label.toLowerCase()}`} onClick={onAdd}><Plus size={20} strokeWidth={3} aria-hidden="true" /></button>
      </div>
      <div className="flow-bars" role="img" aria-label={months.map((m, i) => `${shortMonth(m)} ${inr(values[i])}`).join(', ')}
        style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
        {months.map((m, i) => (
          <span key={monthKey(m)} className={monthKey(m) === monthKey(month) ? 'is-on' : ''}>
            {months.length <= 6 && <em className="num">{values[i] ? inrShort(values[i]) : ''}</em>}
            <i style={{ height: `${values[i] ? Math.max(4, (values[i] / max) * 64) : 2}px` }} />
            <small>{months.length <= 6 ? shortMonth(m) : shortMonth(m).slice(0, 1)}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

export default function FlowCharts({ cards, settings, month, onAdd }: { cards: Card[]; settings: Settings; month: Date; onAdd: (k: 'income' | 'expense') => void }) {
  const [span, setSpan] = useState(6);
  const { toast } = useApp();
  const months = lastMonths(month, span);
  const mine = monthIncome(settings, monthKey(month), today(), cards);
  const remove = async (item: IncomeEntry) => {
    const cur = await getSettings();
    await saveSettings({ incomes: (cur.incomes ?? []).filter(i => i.id !== item.id) });
    toast(`Removed ${item.title} ${inr(item.amount)}`, async () => {
      const now = await getSettings();
      await saveSettings({ incomes: [...(now.incomes ?? []), item] });
    });
  };
  return (
    <div className="money-wide flows">
      <div className="donut-ranges" role="group" aria-label="Chart length">
        {[3, 6, 12].map(n => <button key={n} type="button" aria-pressed={span === n} onClick={() => setSpan(n)}>{n} months</button>)}
      </div>
      <FlowCard kind="income" label="Income" month={month} months={months} onAdd={() => onAdd('income')}
        values={months.map(m => monthIncome(settings, monthKey(m), today(), cards).total)} />
      <FlowCard kind="expense" label="Expense" month={month} months={months} onAdd={() => onAdd('expense')}
        values={months.map(m => spentIn(cards, monthKey(m)))} />
      {(mine.salary || mine.extras.length > 0) && (
        <ul className="cat-list" aria-label="Income this month">
          {mine.salary && <li><div><span><b>Salary</b><small>{fmtDayMonth(mine.salary.date)} · counted automatically</small></span><em className="num is-in">+{inr(mine.salary.amount)}</em></div></li>}
          {mine.extras.map(i => (
            <li key={i.id}><div>
              <span><b>{i.title}</b><small>{[fmtDayMonth(i.date), i.account].filter(Boolean).join(' · ')}</small></span>
              <em className="num is-in">+{inr(i.amount)}</em>
              <button type="button" className="icon-btn" aria-label={`Remove income ${i.title}`} onClick={() => void remove(i)}><Trash2 size={18} aria-hidden="true" /></button>
            </div></li>
          ))}
        </ul>
      )}
    </div>
  );
}
