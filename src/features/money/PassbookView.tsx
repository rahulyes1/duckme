/**
 * Passbook look for Money: a cream ledger page for "safe to spend today", and the cycle's passbook
 * with a running balance. Styles in passbook.css.
 */
import { useMemo, useState } from 'react';
import { Check, Pencil, Plus } from 'lucide-react';
import { useApp } from '../../app-context';
import { fmtDate, inr, today } from '../../lib/format';
import { useCountUp } from '../../lib/hooks';
import type { Card, Settings } from '../../lib/types';
import type { CashFlow } from './cashflow';
import { passbook, type PassLine } from './passbook';
import { usePayBill } from './parts';
import './passbook.css';

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** The cream ledger page at the top of Money. */
export function PaperHero({ flow, onSpend, onEditSalary }: { flow: CashFlow; onSpend: (el: HTMLElement) => void; onEditSalary: () => void }) {
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
        {flow.overBy ? `Spent ${inr(flow.overBy)} more than this cycle allows` : `${inr(flow.left)} left for ${days}`} · salary on {fmtDate(flow.cycle.end).slice(0, 5)}
      </p>
      <div className="pb-split num">
        <div><span>Salary</span><b>{inr(flow.salary)}</b></div>
        <div><span>{billsLabel}</span><b>{inr(flow.billsTotal + flow.sipsTotal)}</b></div>
        <div><span>Spent</span><b>{inr(flow.spent)}</b></div>
      </div>
      <button type="button" className="pb-spend" onClick={e => onSpend(e.currentTarget)}><Plus size={18} strokeWidth={2.6} aria-hidden="true" /> Add spend</button>
    </section>
  );
}

function Line({ l, onPay }: { l: PassLine; onPay?: (c: Card, el: HTMLElement) => void }) {
  const { openCard } = useApp();
  const m = +l.date.slice(5, 7), d = l.date.slice(8, 10);
  return (
    <li className={`pb-row is-${l.kind}`}>
      <button type="button" className="pb-main" disabled={!l.card} onClick={e => l.card && openCard(l.card.id, e.currentTarget)}>
        <span className="pb-date num"><b>{d}</b><small>{MON[m - 1]}</small></span>
        <span className="pb-p"><b>{l.title}</b><span>{l.sub}</span></span>
        <span className="pb-amt num">
          <b className={l.amount >= 0 ? 'cr' : 'dr'}>{l.amount >= 0 ? '+' : '−'}{inr(Math.abs(l.amount)).replace('₹', '')}</b>
          {l.balance !== null && <small>{l.kind === 'due' ? 'then ' : ''}{inr(l.balance)}</small>}
        </span>
      </button>
      {l.kind === 'due' && l.card && onPay && (
        <button type="button" className="pb-pay" aria-label={`Mark ${l.title} paid`} onClick={e => onPay(l.card!, e.currentTarget)}><Check size={16} aria-hidden="true" /></button>
      )}
    </li>
  );
}

const FIRST = 7;

/** This cycle, line by line, with the running balance — newest first, bills still due on top. */
export function PassbookList({ cards, settings }: { cards: Card[]; settings: Settings }) {
  const pay = usePayBill();
  const [all, setAll] = useState(false);
  const { lines, cycle } = useMemo(() => passbook(cards, settings.salaryAmount ?? 0, settings.salaryDay, today()), [cards, settings.salaryAmount, settings.salaryDay]);
  if (!lines.length) return null;
  const shown = all ? lines : lines.slice(0, FIRST);
  const label = new Date(cycle.start + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  return (
    <section className="money-wide pb-book" aria-labelledby="pb-h">
      <div className="pb-book-h">
        <h2 id="pb-h">Passbook</h2>
        <small>{label} · {settings.salaryAmount ? 'running balance' : 'set salary for balance'}</small>
      </div>
      <ul className="pb-ledger">
        {shown.map(l => <Line key={l.id} l={l} onPay={(c, el) => void pay(c, el)} />)}
      </ul>
      {lines.length > FIRST && (
        <button type="button" className="btn ghost pb-more" onClick={() => setAll(a => !a)}>{all ? 'Show less' : `Show full passbook (${lines.length})`}</button>
      )}
    </section>
  );
}
