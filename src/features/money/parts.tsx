/** Small building blocks shared by the Money tabs. */
import {
  AlertTriangle, Bus, CalendarClock, Check, Clapperboard, Fuel, Gift, GraduationCap, HeartPulse, House, Receipt, Scissors, Shapes,
  ShieldCheck, ShoppingBag, ShoppingBasket, Smartphone, Sprout, UserRound, Users, UtensilsCrossed, type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../app-context';
import { StaffPaySheet } from './staff-ui';
import { payBillAsking } from './CardPaySheet';
import { addDaysISO, dueLabel, dueTone, fmtDate, fromISO, inr, inrShort, salarySide } from '../../lib/format';
import type { Card } from '../../lib/types';
import { KIND_LABEL } from '../../lib/types';
import { budgetStatus } from './cashflow';
import { monthKey, paidMessage, REPEAT_LABEL, shortMonth, sum } from './money-util';

export const CAT_ICON: Record<string, LucideIcon> = {
  Food: UtensilsCrossed, Groceries: ShoppingBasket, Travel: Bus, Fuel, Shopping: ShoppingBag, Bills: Receipt, Rent: House,
  Staff: UserRound, Health: HeartPulse, Education: GraduationCap, Entertainment: Clapperboard, Family: Users, Investment: Sprout,
  EMI: CalendarClock, Insurance: ShieldCheck, 'Recharge & OTT': Smartphone, 'Personal care': Scissors, 'Gifts & festivals': Gift, Other: Shapes,
};
export const catIcon = (c: string | undefined): LucideIcon => CAT_ICON[c ?? 'Other'] ?? Shapes;

/** Marks a bill paid with the coin burst and an undo toast. */
export function usePayBill() {
  const { burst, toast } = useApp();
  return async (c: Card, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const r = await payBillAsking(c);
    if (!r) return;
    burst(rect);
    toast(paidMessage(c, r.nextDue, r.expense), r.undo);
  };
}

export function BillRow({ c, salaryDay, showSide = true }: { c: Card; salaryDay: number; showSide?: boolean }) {
  const { openCard } = useApp();
  const pay = usePayBill();
  const [staffOpen, setStaffOpen] = useState(false);
  const side = salarySide(c.due!, salaryDay);
  const tone = dueTone(c.due!);
  const due = fromISO(c.due!);
  // Monthly is the norm, so only the unusual repeats (quarterly, yearly) get a word.
  const rare = !!c.repeat && c.repeat !== 'none' && c.repeat !== 'monthly';
  return (
    <li className={`money-row money-bill tone-${tone}`} data-color={c.color}>
      <button type="button" className="money-row-main" onClick={e => openCard(c.id, e.currentTarget)}>
        <span className="bill-date" aria-hidden="true"><b className="num">{due.getDate()}</b><small>{due.toLocaleDateString('en-IN', { month: 'short' })}</small></span>
        <span className="bill-txt">
          <span className="money-row-title">{c.title || 'Untitled bill'}</span>
          <span className="bill-when">{dueLabel(c.due!)}<span className="sr-only">, due {fmtDate(c.due!)}</span></span>
          {(showSide || rare) && (
            <span className="bill-meta">
              {[rare ? REPEAT_LABEL[c.repeat!] : '', showSide ? (side === 'before' ? 'before salary' : 'after salary') : ''].filter(Boolean).join(' · ')}
            </span>
          )}
          {c.lastSafe && <span className="bill-meta">Grace till {fmtDate(addDaysISO(c.due!, 3))}</span>}
          {c.penalty && <span className="bill-pen"><AlertTriangle size={12} aria-hidden="true" /> {c.penalty}</span>}
        </span>
      </button>
      <span className="bill-right">
        <span className="money-row-amt num">{c.amount ? inr(c.amount) : '—'}</span>
        <button type="button" className="btn money-paid" aria-label={`${c.staff ? 'Pay' : 'Mark'} ${c.title || 'bill'}${c.staff ? '' : ' paid'}`}
          onClick={e => { if (c.staff) setStaffOpen(true); else void pay(c, e.currentTarget); }}>
          <Check size={15} aria-hidden="true" /> {c.staff ? 'Pay' : 'Paid'}
        </button>
      </span>
      {c.staff && <StaffPaySheet card={c} open={staffOpen} onClose={() => setStaffOpen(false)} />}
    </li>
  );
}

export function MiniRow({ c, right, sub, icon: Icon }: { c: Card; right: string; sub?: string; icon?: LucideIcon }) {
  const { openCard } = useApp();
  return (
    <li>
      <button type="button" className="money-mini" onClick={e => openCard(c.id, e.currentTarget)}>
        {Icon && <span className="money-ico" aria-hidden="true"><Icon size={18} /></span>}
        <span className="money-mini-text">
          <span className="money-row-title">{c.title || `Untitled ${KIND_LABEL[c.type].toLowerCase()}`}</span>
          {sub && <span className="money-sub">{sub}</span>}
        </span>
        <span className="money-row-amt num">{right}</span>
      </button>
    </li>
  );
}

/** Spending bar for one category: share of the month, plus budget status in words (never colour alone). */
export function CategoryBar({ name, amount, total, budget, onSelect, selected, todayAt }: {
  name: string; amount: number; total: number; budget?: number;
  /** When set, the row is a button that filters the expense list to this category. */
  onSelect?: (name: string) => void; selected?: boolean;
  /** Current month only: how far through the month today is (0–1), drawn as a line on budget bars. */
  todayAt?: number;
}) {
  const Icon = catIcon(name);
  const st = budgetStatus(amount, budget);
  const pct = Math.round((amount / Math.max(total, 1)) * 100);
  const fill = st.level === 'none' ? amount / Math.max(total, 1) : Math.min(1, st.frac);
  const body = (
    <>
      <div className="money-cat-top">
        <span className="money-cat-name"><Icon size={16} aria-hidden="true" /> {name}{selected && <span className="money-cat-on">Showing</span>}</span>
        <span className="num"><b>{inr(amount)}</b> <span className="money-muted">{pct}%</span></span>
      </div>
      <span className="pace-wrap" aria-hidden="true">
        <div className="money-bar"><i style={{ transform: `scaleX(${fill})` }} /></div>
        {todayAt !== undefined && st.level !== 'none' && <s style={{ left: `${todayAt * 100}%` }} />}
      </span>
      {st.level !== 'none' && (
        <p className="money-budget num">
          {st.level === 'over'
            ? <><AlertTriangle size={14} aria-hidden="true" /> {inr(st.over)} over · budget {inr(budget)}</>
            : st.level === 'warn'
              ? <><AlertTriangle size={14} aria-hidden="true" /> {inr(st.left)} left · {st.pct}% of {inr(budget)} used</>
              : <>{inr(st.left)} left of {inr(budget)}</>}
        </p>
      )}
    </>
  );
  return (
    <li className={`money-cat money-lvl-${st.level}`}>
      {onSelect ? (
        <button type="button" className="money-cat-btn" aria-pressed={!!selected} aria-label={`Show ${name} expenses, ${inr(amount)}`}
          onClick={() => onSelect(name)}>
          {body}
        </button>
      ) : body}
    </li>
  );
}

/** Six-month spending bars with labels on every bar. */
export function Trend({ months, values, selected }: { months: Date[]; values: number[]; selected: string }) {
  const W = 330, H = 176, top = 24, bottom = 30, left = 8, right = 8;
  const max = Math.max(...values, 1);
  const bw = (W - left - right) / months.length;
  const ch = H - top - bottom;
  const avg = sum(values) / values.length;
  const label = months.map((m, i) => `${shortMonth(m)} ${inr(values[i])}`).join(', ');
  const nonZero = values.filter(v => v > 0).length;
  return (
    <figure className="money-trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Spending, last 6 months: ${label}`}>
        {[0, 0.5, 1].map(f => (
          <line key={f} className="money-grid" x1={left} x2={W - right} y1={top + ch * (1 - f)} y2={top + ch * (1 - f)} />
        ))}
        {months.map((m, i) => {
          const h = Math.max(values[i] > 0 ? 3 : 0, (values[i] / max) * ch);
          const x = left + i * bw + bw * 0.18, w = bw * 0.64;
          const cur = monthKey(m) === selected;
          return (
            <g key={i}>
              <rect className={`money-tbar ${cur ? 'cur' : ''}`} x={x} y={top + ch - h} width={w} height={h} rx={5} />
              <text className="money-tval" x={x + w / 2} y={top + ch - h - 6} textAnchor="middle">{values[i] ? inrShort(values[i]) : '₹0'}</text>
              <text className={`money-tlab ${cur ? 'cur' : ''}`} x={x + w / 2} y={H - 9} textAnchor="middle">{shortMonth(m)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="money-muted">
        {nonZero === 0
          ? 'No spends yet'
          : <>Avg <b className="num">{inr(avg)}</b>/mo</>}
      </figcaption>
    </figure>
  );
}

export { readPref, writePref } from '../../lib/prefs';
