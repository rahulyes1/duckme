/** Small building blocks shared by the Money tabs. */
import {
  AlertTriangle, Bus, Check, Clapperboard, Fuel, GraduationCap, HeartPulse, House, Receipt, Repeat2, Shapes, ShoppingBag,
  ShoppingBasket, UserRound, Users, UtensilsCrossed, type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../app-context';
import { StaffPaySheet } from './staff-ui';
import { payBill } from '../../lib/actions';
import { addDaysISO, fmtDate, inr, inrShort, salarySide } from '../../lib/format';
import type { Card } from '../../lib/types';
import { KIND_LABEL } from '../../lib/types';
import { DuePill } from '../../ui/CardTile';
import { budgetStatus } from './cashflow';
import { longMonth, monthKey, paidMessage, REPEAT_LABEL, shortMonth, sum } from './money-util';

export const CAT_ICON: Record<string, LucideIcon> = {
  Food: UtensilsCrossed, Groceries: ShoppingBasket, Travel: Bus, Fuel, Shopping: ShoppingBag, Bills: Receipt, Rent: House,
  Staff: UserRound, Health: HeartPulse, Education: GraduationCap, Entertainment: Clapperboard, Family: Users, Other: Shapes,
};
export const catIcon = (c: string | undefined): LucideIcon => CAT_ICON[c ?? 'Other'] ?? Shapes;

/** Marks a bill paid with the coin burst and an undo toast. */
export function usePayBill() {
  const { burst, toast } = useApp();
  return async (c: Card, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const r = await payBill(c.id);
    burst(rect);
    toast(paidMessage(c, r.nextDue), r.undo);
  };
}

export function BillRow({ c, salaryDay, showSide = true }: { c: Card; salaryDay: number; showSide?: boolean }) {
  const { openCard } = useApp();
  const pay = usePayBill();
  const [staffOpen, setStaffOpen] = useState(false);
  const side = salarySide(c.due!, salaryDay);
  return (
    <li className="money-row money-bill" data-color={c.color}>
      <button type="button" className="money-row-main" onClick={e => openCard(c.id, e.currentTarget)}>
        <span className="money-row-top">
          <span className="money-row-title">{c.title || 'Untitled bill'}</span>
          <span className="money-row-amt num">{c.amount ? inr(c.amount) : 'No amount'}</span>
        </span>
        <span className="money-pills">
          <DuePill due={c.due!} />
          <span className="pill">{fmtDate(c.due!)}</span>
          {showSide && <span className="pill outline">{side === 'before' ? 'Before salary' : 'After salary'}</span>}
          {c.lastSafe && <span className="pill outline">Last safe day {fmtDate(addDaysISO(c.due!, 3))}</span>}
          {c.repeat && c.repeat !== 'none' && <span className="pill"><Repeat2 size={11} aria-hidden="true" />{REPEAT_LABEL[c.repeat]}</span>}
          {c.penalty && <span className="pill pen"><AlertTriangle size={11} aria-hidden="true" />{c.penalty}</span>}
        </span>
      </button>
      <button type="button" className="btn money-paid" aria-label={`${c.staff ? 'Pay' : 'Mark'} ${c.title || 'bill'}${c.staff ? '' : ' paid'}`}
        onClick={e => { if (c.staff) setStaffOpen(true); else void pay(c, e.currentTarget); }}>
        <Check size={16} aria-hidden="true" /> {c.staff ? 'Pay' : 'Paid'}
      </button>
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
export function CategoryBar({ name, amount, total, budget }: { name: string; amount: number; total: number; budget?: number }) {
  const Icon = catIcon(name);
  const st = budgetStatus(amount, budget);
  const pct = Math.round((amount / Math.max(total, 1)) * 100);
  const fill = st.level === 'none' ? amount / Math.max(total, 1) : Math.min(1, st.frac);
  return (
    <li className={`money-cat money-lvl-${st.level}`}>
      <div className="money-cat-top">
        <span className="money-cat-name"><Icon size={16} aria-hidden="true" /> {name}</span>
        <span className="num"><b>{inr(amount)}</b> <span className="money-muted">{pct}%</span></span>
      </div>
      <div className="money-bar" aria-hidden="true"><i style={{ transform: `scaleX(${fill})` }} /></div>
      {st.level !== 'none' && (
        <p className="money-budget num">
          {st.level === 'over'
            ? <><AlertTriangle size={14} aria-hidden="true" /> {inr(st.over)} over · budget {inr(budget)}</>
            : st.level === 'warn'
              ? <><AlertTriangle size={14} aria-hidden="true" /> {inr(st.left)} left · {st.pct}% of {inr(budget)} used</>
              : <>{inr(st.left)} left of {inr(budget)}</>}
        </p>
      )}
    </li>
  );
}

/** Six-month spending bars with labels on every bar. */
export function Trend({ months, values, selected }: { months: Date[]; values: number[]; selected: string }) {
  const W = 330, H = 170, top = 22, bottom = 26, left = 8, right = 8;
  const max = Math.max(...values, 1);
  const bw = (W - left - right) / months.length;
  const ch = H - top - bottom;
  const avg = sum(values) / values.length;
  const hi = values.indexOf(Math.max(...values));
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
              <text className={`money-tlab ${cur ? 'cur' : ''}`} x={x + w / 2} y={H - 8} textAnchor="middle">{shortMonth(m)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="money-muted">
        {nonZero === 0
          ? 'No spending recorded in these six months yet.'
          : <>Average <b className="num">{inr(avg)}</b> a month. Highest was {longMonth(months[hi])} at <b className="num">{inr(values[hi])}</b>.</>}
      </figcaption>
    </figure>
  );
}

/** Reads/writes a small UI preference; storage can be blocked, so every access is guarded. */
export function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch { return fallback; }
}
export function writePref(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* storage blocked */ }
}
