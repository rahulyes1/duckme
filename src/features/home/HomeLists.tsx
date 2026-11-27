/**
 * Home's short lists: bills due before salary (Pay inline) and the last few spends.
 * Max three rows each; the full lists live in Money. Styles in home.css (.hl-*).
 */
import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { Card } from '../../lib/types';
import { useApp } from '../../app-context';
import { dueLabel, dueTone, fmtDayMonth, inr, todayISO } from '../../lib/format';
import { writePref } from '../../lib/prefs';
import { payBillAsking } from '../money/CardPaySheet';
import { paidMessage } from '../money/money-util';
import type { CycleItem } from '../money/cashflow';
import { TYPE_ICON } from '../../ui/CardTile';

/** Opens Money on one tab (Bills / Expenses). */
function useOpenMoney() {
  const app = useApp();
  return (tab: 'bills' | 'expenses') => { writePref('hisaab.money.tab', tab); app.go('money'); };
}

function DueRow({ item }: { item: CycleItem }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const c = item.card;
  const pay = async (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setBusy(true);
    try {
      const r = await payBillAsking(c);
      if (!r) return;
      app.burst(rect);
      app.toast(paidMessage(c, r.nextDue, r.expense), r.undo);
    } catch {
      app.toast('Could not mark that paid.');
    } finally {
      setBusy(false);
    }
  };
  const tone = dueTone(item.date);
  return (
    <li className={`hl-row tone-${tone}`}>
      <button type="button" className="hl-main" onClick={e => app.openCard(c.id, e.currentTarget.closest('li'))}>
        <span className="hl-t">{c.title || 'Bill'}</span>
        <small className="hl-sub">{tone === 'normal' ? fmtDayMonth(item.date) : dueLabel(item.date)}</small>
      </button>
      <b className="hl-amt num">{inr(item.amount)}</b>
      <button type="button" className="btn hl-pay" disabled={busy} onClick={e => void pay(e.currentTarget)}
        aria-label={`Pay ${c.title || 'bill'} ${inr(item.amount)}`}>
        <Check size={16} aria-hidden="true" />Pay
      </button>
    </li>
  );
}

export function DueList({ bills }: { bills: CycleItem[] }) {
  const open = useOpenMoney();
  if (!bills.length) return null;
  const shown = bills.slice(0, 3);
  const total = bills.reduce((s, b) => s + b.amount, 0);
  return (
    <section className="hl" aria-labelledby="hl-due">
      <div className="hl-head">
        <h2 id="hl-due">Due before salary</h2>
        <button type="button" className="hl-link num" onClick={() => open('bills')}>
          {inr(total)}{bills.length > 3 ? ` · +${bills.length - 3}` : ''} <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
      <ul className="hl-list">{shown.map(b => <DueRow key={b.card.id} item={b} />)}</ul>
    </section>
  );
}

export function RecentSpends({ spends }: { spends: Card[] }) {
  const app = useApp();
  const open = useOpenMoney();
  if (!spends.length) return null;
  const Icon = TYPE_ICON.expense;
  const t = todayISO();
  return (
    <section className="hl" aria-labelledby="hl-recent">
      <div className="hl-head">
        <h2 id="hl-recent">Recent spends</h2>
        <button type="button" className="hl-link" onClick={() => open('expenses')}>All <ArrowRight size={16} aria-hidden="true" /></button>
      </div>
      <ul className="hl-list">
        {spends.map(c => (
          <li key={c.id} className="hl-row">
            <button type="button" className="hl-main" onClick={e => app.openCard(c.id, e.currentTarget.closest('li'))}>
              <span className="hl-t"><Icon size={15} aria-hidden="true" className="hl-ic" />{c.title || c.category || 'Spend'}</span>
              <small className="hl-sub">{[c.title && c.title !== c.category ? c.category : '', c.date === t ? 'Today' : c.date ? fmtDayMonth(c.date) : ''].filter(Boolean).join(' · ')}</small>
            </button>
            <b className="hl-amt num">{inr(c.amount)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
