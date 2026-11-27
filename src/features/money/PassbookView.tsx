/**
 * Passbook look for Money: a cream ledger page for "safe to spend today", and the cycle's passbook
 * with a running balance. Styles in passbook.css.
 */
import { useMemo, useState } from 'react';
import { Check, MoreHorizontal, PenLine as PenIcon, Pencil } from 'lucide-react';
import { useApp } from '../../app-context';
import { fmtDate, inr, today, todayISO, fmtDayMonth } from '../../lib/format';
import { useCountUp } from '../../lib/hooks';
import { createCard, logInvestment, withUndo } from '../../lib/actions';
import { investKindFromText, looksDuplicate, parsePenLine } from '../../lib/capture';
import { buzz } from '../../lib/format';
import type { Card, Settings } from '../../lib/types';
import type { CashFlow } from './cashflow';
import { passbook, type PassLine } from './passbook';
import { usePayBill } from './parts';
import './passbook.css';

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** The cream ledger page at the top of Money. */
export function PaperHero({ flow, monthSpent, onEditSalary }: { flow: CashFlow; monthSpent: number; onEditSalary: () => void }) {
  const big = useCountUp(flow.safeToday, 800);
  const days = flow.cycle.daysLeft === 1 ? '1 day' : `${flow.cycle.daysLeft} days`;
  const billsLabel = flow.sipsTotal ? 'Bills & SIPs' : 'Bills due';
  return (
    <section className={`money-wide pb-page ${flow.overBy ? 'is-over' : ''}`} aria-labelledby="pb-k">
      <div className="pb-page-top">
        <span id="pb-k" className="pb-k">{flow.overBy ? 'Over budget this cycle' : 'Safe to spend today'}</span>
        <button type="button" className="pb-edit" onClick={onEditSalary} aria-label="Edit salary"><Pencil size={14} aria-hidden="true" /> Salary</button>
      </div>
      <b className="pb-big num" aria-live="off">{flow.overBy ? `−${inr(flow.overBy)}` : inr(big)}</b>
      <svg className="pb-ul" viewBox="0 0 170 8" preserveAspectRatio="none" aria-hidden="true">
        <path d="M2 5 Q 40 1 85 4 T 168 3" pathLength={1} />
      </svg>
      <p className="pb-sub num">
        {flow.overBy ? `${inr(flow.overBy)} over` : `${inr(flow.left)} left · ${days}`} · salary {fmtDayMonth(flow.cycle.end)}
      </p>
      <div className="pb-split num">
        <div><span>{flow.extra ? 'Income' : 'Salary'}</span><b>{inr(flow.salary + flow.extra)}</b></div>
        <div><span>{billsLabel}</span><b>{inr(flow.billsTotal + flow.sipsTotal)}</b></div>
        <div><span>Spent</span><b>{inr(monthSpent)}</b></div>
      </div>
      {flow.onCard > 0 && <p className="pb-oncard num">{inr(flow.onCard)} on card</p>}
    </section>
  );
}

function Line({ l, onPay, mon }: { l: PassLine; onPay?: (c: Card, el: HTMLElement) => void; /** Month shown in the header: rows in it skip the month word. */ mon: number }) {
  const { openCard } = useApp();
  const m = +l.date.slice(5, 7), d = l.date.slice(8, 10);
  return (
    <li className={`pb-row is-${l.kind}`}>
      <button type="button" className="pb-main" disabled={!l.card} onClick={e => l.card && openCard(l.card.id, e.currentTarget)}>
        <span className="pb-date num"><b>{d}</b>{m !== mon ? <small>{MON[m - 1]}</small> : <small className="sr-only">{MON[m - 1]}</small>}</span>
        <span className="pb-p"><b>{l.title}</b><span>{l.sub}</span></span>
        <span className="pb-amt num">
          <b className={l.amount >= 0 ? 'cr' : 'dr'}>{l.amount >= 0 ? '+' : '−'}{inr(Math.abs(l.amount)).replace('₹', '')}</b>
          {l.balance !== null && <small>{l.kind === 'due' ? 'then ' : ''}{inr(l.balance)}</small>}
        </span>
      </button>
      {l.kind === 'due' && l.card?.type === 'bill' && onPay && (
        <button type="button" className="pb-pay" aria-label={`Mark ${l.title} paid`} onClick={e => onPay(l.card!, e.currentTarget)}><Check size={16} aria-hidden="true" /></button>
      )}
    </li>
  );
}

const FIRST = 4;

const dayLabel = (iso: string) => {
  const t = today(), d = new Date(iso + 'T00:00:00');
  const diff = Math.round((t.getTime() - d.getTime()) / 86400000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

/** Write a spend straight into the passbook: "250 auto cash yday" → Enter. */
export function PenLine({ cards, onMore }: { cards: Card[]; onMore?: (el: HTMLElement) => void }) {
  const { toast } = useApp();
  const [text, setText] = useState('');
  const p = useMemo(() => (text.trim() ? parsePenLine(text, today(), cards) : null), [text, cards]);
  const ready = !!p?.amount;

  const save = async () => {
    if (!p?.amount) return;
    const kind = investKindFromText(text);
    if (kind) {
      const undo = await logInvestment({ amount: p.amount, date: p.date, title: p.title || kind, kind, mode: p.mode ?? 'UPI' });
      buzz(10);
      setText('');
      toast(`Saved as investment (${kind} ${inr(p.amount)}), not a spend.`, undo);
      return;
    }
    const category = p.category ?? 'Other', title = p.title || category;
    const dup = looksDuplicate(cards, { amount: p.amount, category, title, date: p.date }, Date.now());
    const undo = await withUndo(async () => { await createCard({ type: 'expense', title, amount: p.amount!, date: p.date, category, mode: p.mode ?? 'UPI' }); });
    buzz(10);
    setText('');
    toast(dup ? `Written. Same as one a few minutes ago — Undo if it's a repeat.` : `Written: ${title} ${inr(p.amount)}${p.date !== todayISO() ? ` · ${dayLabel(p.date)}` : ''}`, undo);
  };

  return (
    <form className="pb-pen" onSubmit={e => { e.preventDefault(); void save(); }}>
      <PenIcon size={16} aria-hidden="true" className="pb-pen-ic" />
      <label htmlFor="pb-pen-in" className="sr-only">Write a spend</label>
      <input id="pb-pen-in" className="pb-pen-in" value={text} autoComplete="off" enterKeyHint="done"
        placeholder="Quick: 250 auto cash yday" onChange={e => setText(e.target.value)} />
      {onMore && !text && <button type="button" className="pb-pen-more" aria-label="Open the number pad" onClick={e => onMore(e.currentTarget)}><MoreHorizontal size={18} aria-hidden="true" /></button>}
      {ready && <button type="submit" className="pb-pen-go" aria-label="Write it"><Check size={18} aria-hidden="true" /></button>}
      {p && (
        <div className="pb-pen-chips num" aria-live="polite">
          {p.amount ? <span className="is-amt">{inr(p.amount)}</span> : <span className="is-need">add an amount</span>}
          <span>{p.category ?? 'Other'}</span>
          <span>{p.mode ?? 'UPI'}</span>
          <span>{dayLabel(p.date)}</span>
          {p.title && <span className="is-title">{p.title}</span>}
        </div>
      )}
    </form>
  );
}

/** This cycle, line by line, with the running balance — newest first, bills still due on top. */
export function PassbookList({ cards, settings, onSpend }: { cards: Card[]; settings: Settings; onSpend?: (el: HTMLElement) => void }) {
  const pay = usePayBill();
  const [all, setAll] = useState(false);
  const { lines, cycle } = useMemo(() => passbook(cards, settings.salaryAmount ?? 0, settings.salaryDay, today(), settings.incomes), [cards, settings.salaryAmount, settings.salaryDay, settings.incomes]);
  const shown = all ? lines : lines.slice(0, FIRST);
  const label = new Date(cycle.start + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  return (
    <section className="money-wide pb-book" aria-labelledby="pb-h">
      <div className="pb-book-h">
        <h2 id="pb-h">Passbook</h2>
        <small>{label}</small>
      </div>
      <div className="pb-ledger">
        <PenLine cards={cards} onMore={onSpend} />
        <ul className="pb-lines">
          {shown.map(l => <Line key={l.id} l={l} mon={+cycle.start.slice(5, 7)} onPay={(c, el) => void pay(c, el)} />)}
        </ul>
      </div>
      {lines.length > FIRST && (
        <button type="button" className="btn ghost pb-more" onClick={() => setAll(a => !a)}>{all ? 'Show less' : `See all ${lines.length}`}</button>
      )}
    </section>
  );
}
