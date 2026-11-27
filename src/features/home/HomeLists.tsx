/**
 * Home's short lists: bills due before salary (Pay inline) and the last few spends.
 * Max three rows each; the full lists live in Money. Styles in home.css (.hl-*).
 */
import { useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Plus } from 'lucide-react';
import type { Card, IncomeEntry } from '../../lib/types';
import { useApp } from '../../app-context';
import { buzz, dueLabel, dueTone, fmtDayMonth, inr, todayISO } from '../../lib/format';
import { createCard, updateCard, withUndo } from '../../lib/actions';
import { usualSpends, type Usual } from '../../lib/capture';
import type { AheadItem } from './helpers';
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

/** Hold a row (or right-click) to move the bill to salary day. Undo in the toast. */
function useHoldToSalary(c: Card, salaryISO: string) {
  const app = useApp();
  const t = useRef<{ id?: number; fired: boolean; x: number; y: number }>({ fired: false, x: 0, y: 0 });
  const move = async () => {
    if (!c.due || c.due >= salaryISO) return;
    const undo = await withUndo(() => updateCard(c.id, { due: salaryISO }));
    buzz(25);
    app.toast(`${c.title || 'Bill'} moved to ${fmtDayMonth(salaryISO)}${c.penalty ? ` · ${c.penalty}` : ''}`, undo);
  };
  const cancel = () => clearTimeout(t.current.id);
  return {
    fired: () => { const f = t.current.fired; t.current.fired = false; return f; },
    props: {
      onPointerDown: (e: React.PointerEvent) => {
        cancel();
        t.current = { fired: false, x: e.clientX, y: e.clientY, id: window.setTimeout(() => { t.current.fired = true; void move(); }, 550) };
      },
      onPointerMove: (e: React.PointerEvent) => { if (Math.hypot(e.clientX - t.current.x, e.clientY - t.current.y) > 10) cancel(); },
      onPointerUp: cancel, onPointerCancel: cancel, onPointerLeave: cancel,
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); if (!t.current.fired) void move(); },
    },
  };
}

function DueRow({ item, salaryISO }: { item: CycleItem; salaryISO: string }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const c = item.card;
  const hold = useHoldToSalary(c, salaryISO);
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
      <button type="button" className="hl-main" title="Hold: move to salary day" {...hold.props}
        onClick={e => { if (!hold.fired()) app.openCard(c.id, e.currentTarget.closest('li')); }}>
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

export function DueList({ bills, salaryISO }: { bills: CycleItem[]; salaryISO: string }) {
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
      <ul className="hl-list">{shown.map(b => <DueRow key={b.card.id} item={b} salaryISO={salaryISO} />)}</ul>
    </section>
  );
}

/** Your usual spends (chai ₹20, auto ₹50) as one-tap chips: tap = logged for today, Undo in the toast. */
function AgainChips({ cards }: { cards: Card[] }) {
  const app = useApp();
  const hour = new Date().getHours();
  const usual = useMemo(() => usualSpends(cards, new Date()).slice(0, 3), [cards, hour]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!usual.length) return null;
  const add = async (u: Usual, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const undo = await withUndo(async () => { await createCard({ type: 'expense', title: u.title, amount: u.amount, date: todayISO(), category: u.category, mode: u.mode }); });
    buzz(12);
    app.burst(rect);
    app.toast(`${u.title} ${inr(u.amount)} added`, undo);
  };
  return (
    <div className="hl-again" role="group" aria-label="Log again today">
      {usual.map(u => (
        <button key={u.title + u.amount} type="button" className="chip hl-again-chip" onClick={e => void add(u, e.currentTarget)}
          aria-label={`Add ${u.title} ${inr(u.amount)} today`}>
          <Plus size={14} aria-hidden="true" />{u.title} <b className="num">{inr(u.amount)}</b>
        </button>
      ))}
    </div>
  );
}

const AHEAD_SUB: Record<AheadItem['kind'], string> = { bill: '', expiry: 'Expires', maturity: 'Matures' };
const REPEAT_WORD: Record<string, string> = { yearly: 'Yearly', quarterly: 'Quarterly', none: 'Once' };

/** Yearly bills, renewals, expiries and maturities in the next 60 days: the ones that surprise you. */
export function AheadList({ items }: { items: AheadItem[] }) {
  const app = useApp();
  if (!items.length) return null;
  const shown = items.slice(0, 3);
  const due = items.filter(i => i.kind === 'bill').reduce((s, i) => s + i.amount, 0);
  return (
    <section className="hl" aria-labelledby="hl-ahead">
      <div className="hl-head">
        <h2 id="hl-ahead">Next 60 days</h2>
        {due > 0 && <span className="hl-note num">{inr(due)}{items.length > 3 ? ` · +${items.length - 3}` : ''}</span>}
      </div>
      <ul className="hl-list">
        {shown.map(i => {
          const c = i.card;
          const sub = i.kind === 'bill'
            ? [c.autorenew ? 'Renews' : REPEAT_WORD[c.repeat ?? 'none'] ?? '', fmtDayMonth(i.date)].filter(Boolean).join(' · ')
            : `${AHEAD_SUB[i.kind]} ${fmtDayMonth(i.date)}`;
          return (
            <li key={`${c.id}-${i.kind}`} className="hl-row">
              <button type="button" className="hl-main" onClick={e => app.openCard(c.id, e.currentTarget.closest('li'))}>
                <span className="hl-t">{c.title || 'Untitled'}</span>
                <small className="hl-sub">{sub}</small>
              </button>
              {i.amount > 0 && <b className={`hl-amt num${i.kind === 'maturity' ? ' is-in' : ''}`}>{i.kind === 'maturity' ? '+' : ''}{inr(i.amount)}</b>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function RecentSpends({ spends, cards, incomes = [] }: { spends: Card[]; cards: Card[]; incomes?: IncomeEntry[] }) {
  const app = useApp();
  const open = useOpenMoney();
  if (!spends.length && !incomes.length) return null;
  // Spends and the income you added, newest first, as one history.
  const rows = [...spends.map(c => ({ date: c.date ?? '', at: c.createdAt, spend: c, income: undefined as IncomeEntry | undefined })),
    ...incomes.map(i => ({ date: i.date, at: i.createdAt, spend: undefined as Card | undefined, income: i }))]
    .sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at).slice(0, 5);
  const Icon = TYPE_ICON.expense;
  const t = todayISO();
  return (
    <section className="hl" aria-labelledby="hl-recent">
      <div className="hl-head">
        <h2 id="hl-recent">Recent transactions</h2>
        <button type="button" className="hl-link" onClick={() => open('expenses')}>All <ArrowRight size={16} aria-hidden="true" /></button>
      </div>
      <AgainChips cards={cards} />
      <ul className="hl-list">
        {rows.map(({ spend: c, income: i }) => i ? (
          <li key={i.id} className="hl-row">
            <button type="button" className="hl-main" onClick={() => open('expenses')}>
              <span className="hl-t">{i.title || 'Income'}</span>
              <small className="hl-sub">{['Income', i.date === t ? 'Today' : fmtDayMonth(i.date)].join(' · ')}</small>
            </button>
            <b className="hl-amt num is-in">+{inr(i.amount)}</b>
          </li>
        ) : c && (
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
