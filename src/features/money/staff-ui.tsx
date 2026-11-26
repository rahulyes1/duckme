/** Household staff ledger: the Bills tab section, the Pay sheet, quick actions and the editor ledger. */
import {
  Banknote, CalendarMinus, CalendarPlus, Gift, HandCoins, History, Minus, Phone, Plus, UserRound, Wallet,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app-context';
import { fmtDate, fmtDayMonth, inr, today, todayISO } from '../../lib/format';
import type { Card, StaffEntry, StaffInfo } from '../../lib/types';
import { isActive } from '../../lib/types';
import { DuePill } from '../../ui/CardTile';
import { Sheet } from '../../ui/Sheet';
import { RupeeField } from './autopay-ui';
import { monthKey } from './money-util';
import {
  daysInMonth, daysSinceLastPaid, defaultRecovery, isFestivalSeason, netPay, perDayRate, recentLog, STAFF_ROLES,
} from './staff';
import { createStaff, giveAdvance, logStaffDays, payStaff } from './staff-actions';
import './autopay-staff.css';

const MODES = ['Cash', 'UPI'] as const;
const NO_DAYS_ROLES = new Set(['Landlord']);

function ChipRow<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T | undefined; onChange: (v: T) => void }) {
  const id = `st-chips-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="field">
      <span className="label" id={id}>{label}</span>
      <div className="money-chips" role="group" aria-labelledby={id}>
        {options.map(o => <button key={o} type="button" className="chip" aria-pressed={value === o} onClick={() => onChange(o)}>{o}</button>)}
      </div>
    </div>
  );
}

/** Whole or half days with − / + buttons (44px targets) and a typed box. */
function DaysField({ id, label, value, onChange, help }: { id: string; label: string; value: number; onChange: (n: number) => void; help?: string }) {
  const clamp = (n: number) => Math.max(0, Math.min(31, Math.round(n * 2) / 2));
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="money-st-days">
        <button type="button" className="icon-btn" aria-label={`One day less, ${label}`} onClick={() => onChange(clamp(value - 1))} disabled={value <= 0}>
          <Minus size={18} aria-hidden="true" />
        </button>
        <input id={id} className="input num" inputMode="decimal" autoComplete="off" value={String(value)} aria-describedby={help ? `${id}-help` : undefined}
          onChange={e => { const n = parseFloat(e.target.value); onChange(Number.isFinite(n) ? clamp(n) : 0); }} />
        <button type="button" className="icon-btn" aria-label={`One day more, ${label}`} onClick={() => onChange(clamp(value + 1))}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      {help && <span className="help" id={`${id}-help`}>{help}</span>}
    </div>
  );
}

/* ---------- Pay sheet ---------- */

export function StaffPaySheet({ card, open, onClose, onPaid }: { card: Card; open: boolean; onClose: () => void; onPaid?: () => void }) {
  const { toast, burst } = useApp();
  const staff = card.staff;
  const pay = card.amount ?? 0;
  const [leave, setLeave] = useState(0);
  const [leaveRate, setLeaveRate] = useState<number | undefined>();
  const [extra, setExtra] = useState(0);
  const [recovery, setRecovery] = useState<number | undefined>();
  const [bonus, setBonus] = useState<number | undefined>();
  const [mode, setMode] = useState<typeof MODES[number]>('Cash');
  const [busy, setBusy] = useState(false);

  // Fresh defaults every time the sheet opens: leave/extra since the last payment, recover what's possible.
  useEffect(() => {
    if (!open) return;
    const log = staff?.log ?? [];
    setLeave(daysSinceLastPaid(log, 'leave'));
    setExtra(daysSinceLastPaid(log, 'extra'));
    setLeaveRate(perDayRate(pay));
    setRecovery(defaultRecovery(staff?.advance ?? 0, pay) || undefined);
    setBonus(undefined);
    setMode('Cash');
    setBusy(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const rate = leaveRate ?? perDayRate(pay);
  const p = netPay({ base: pay, leaveDays: leave, leaveRate: rate, extraDays: extra, extraRate: rate, recovery, advance: staff?.advance ?? 0, bonus });
  const id = `pay-${card.id}`;
  const festival = isFestivalSeason(today().getMonth());

  const confirm = async (el: HTMLElement) => {
    if (busy) return;
    setBusy(true);
    const rect = el.getBoundingClientRect();
    const r = await payStaff(card.id, p, mode);
    burst(rect);
    toast(`${card.title || 'Staff'} paid ${inr(p.net)}${r.nextDue ? `. Next pay day ${fmtDate(r.nextDue)}.` : '.'}`, r.undo);
    onClose();
    onPaid?.();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Pay ${card.title || 'staff'}`}>
      <div className="money-st-pay">
        <p className="money-st-base">
          <span className="money-k">Monthly pay</span>
          <span className="num money-mid">{inr(pay)}</span>
        </p>
        {!pay && <p className="money-muted">Set the monthly pay in the card first.</p>}
        <div className="money-st-grid">
          <DaysField id={`${id}-leave`} label="Leave days" value={leave} onChange={setLeave} help="Since the last payment. Cut pro-rata." />
          <RupeeField id={`${id}-rate`} label="Cut per leave day" value={leaveRate} onValue={setLeaveRate} help={`Default is pay ÷ 30 = ${inr(perDayRate(pay))}`} />
          <DaysField id={`${id}-extra`} label="Extra days" value={extra} onChange={setExtra} help="Paid at the same day rate." />
          <RupeeField id={`${id}-rec`} label="Advance to recover" value={recovery} onValue={setRecovery}
            help={staff?.advance ? `${inr(staff.advance)} outstanding` : 'No advance outstanding'} />
          <RupeeField id={`${id}-bonus`} label="Bonus" value={bonus} onValue={setBonus} help={festival ? 'Festival season: many give one month\'s pay.' : undefined} />
        </div>
        {festival && !bonus && pay > 0 && (
          <button type="button" className="chip money-st-fest" onClick={() => setBonus(pay)}>
            <Gift size={14} aria-hidden="true" /> Add festival bonus {inr(pay)}
          </button>
        )}
        <ChipRow label="Paid with" options={MODES} value={mode} onChange={setMode} />

        <dl className="money-st-break num" aria-live="polite">
          <div><dt>Base pay</dt><dd>{inr(p.base)}</dd></div>
          {p.leaveCut > 0 && <div><dt>Leave ({leave} {leave === 1 ? 'day' : 'days'})</dt><dd>−{inr(p.leaveCut)}</dd></div>}
          {p.extraPay > 0 && <div><dt>Extra ({extra} {extra === 1 ? 'day' : 'days'})</dt><dd>+{inr(p.extraPay)}</dd></div>}
          {p.recovery > 0 && <div><dt>Advance recovered</dt><dd>−{inr(p.recovery)}</dd></div>}
          {p.bonus > 0 && <div><dt>Bonus</dt><dd>+{inr(p.bonus)}</dd></div>}
          <div className="money-st-net"><dt>You pay</dt><dd>{inr(p.net)}</dd></div>
        </dl>
        <button type="button" className="btn primary block money-st-confirm" disabled={busy} onClick={e => confirm(e.currentTarget)}>
          <Banknote size={18} aria-hidden="true" /> Confirm {inr(p.net)} paid
        </button>
        <p className="money-muted">This records the payment. No money moves from Hisaab.</p>
      </div>
    </Sheet>
  );
}

/* ---------- quick actions ---------- */

function AdvanceSheet({ card, open, onClose }: { card: Card; open: boolean; onClose: () => void }) {
  const { toast } = useApp();
  const [amt, setAmt] = useState<number | undefined>();
  const [mode, setMode] = useState<typeof MODES[number]>('Cash');
  useEffect(() => { if (open) { setAmt(undefined); setMode('Cash'); } }, [open]);
  const save = async () => {
    if (!amt) return;
    const undo = await giveAdvance(card.id, amt, mode);
    toast(`Advance ${inr(amt)} to ${card.title || 'staff'} noted`, undo);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Advance to ${card.title || 'staff'}`}>
      <form className="money-st-pay" onSubmit={e => { e.preventDefault(); void save(); }}>
        <RupeeField id={`adv-${card.id}`} label="Advance amount" value={amt} onValue={setAmt} allowZero={false} autoFocus
          help="Added to what they owe you, and saved as a Staff expense." />
        <ChipRow label="Given as" options={MODES} value={mode} onChange={setMode} />
        <button type="submit" className="btn primary block" disabled={!amt}><HandCoins size={18} aria-hidden="true" /> Save advance</button>
      </form>
    </Sheet>
  );
}

function LeaveSheet({ card, open, onClose }: { card: Card; open: boolean; onClose: () => void }) {
  const { toast } = useApp();
  const [days, setDays] = useState(1);
  const [date, setDate] = useState(todayISO());
  useEffect(() => { if (open) { setDays(1); setDate(todayISO()); } }, [open]);
  const save = async () => {
    if (!days) return;
    const undo = await logStaffDays(card.id, 'leave', days, date || todayISO());
    toast(`${days} leave ${days === 1 ? 'day' : 'days'} noted for ${card.title || 'staff'}`, undo);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Leave for ${card.title || 'staff'}`}>
      <form className="money-st-pay" onSubmit={e => { e.preventDefault(); void save(); }}>
        <DaysField id={`lv-${card.id}`} label="Days off" value={days} onChange={setDays} />
        <div className="field">
          <label htmlFor={`lv-d-${card.id}`}>From</label>
          <input id={`lv-d-${card.id}`} type="date" className="input num" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <button type="submit" className="btn primary block" disabled={!days}><CalendarMinus size={18} aria-hidden="true" /> Save leave</button>
      </form>
    </Sheet>
  );
}

/* ---------- row ---------- */

function StaffRow({ c }: { c: Card }) {
  const { openCard, toast } = useApp();
  const [sheet, setSheet] = useState<'pay' | 'adv' | 'leave' | null>(null);
  const close = () => setSheet(null);
  const s = c.staff!;
  const leaves = daysInMonth(s.log, 'leave', monthKey(today()));
  const extras = daysInMonth(s.log, 'extra', monthKey(today()));
  const days = !NO_DAYS_ROLES.has(s.role);

  const extraDay = async () => {
    const undo = await logStaffDays(c.id, 'extra', 1);
    toast(`Extra day noted for ${c.title || 'staff'}`, undo);
  };

  return (
    <li className="money-st-row" data-color={c.color}>
      <div className="money-st-head">
        <button type="button" className="money-st-main" onClick={e => openCard(c.id, e.currentTarget)}>
          <span className="money-ico" aria-hidden="true"><UserRound size={18} /></span>
          <span className="money-mini-text">
            <span className="money-row-title">{c.title || 'Unnamed'}</span>
            <span className="money-sub">{s.role} · pay day {c.due ? fmtDayMonth(c.due) : 'not set'} · {inr(c.amount)}/month</span>
          </span>
        </button>
        {s.phone && (
          <a className="icon-btn" href={`tel:${s.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${c.title || 'staff'}`}><Phone size={18} aria-hidden="true" /></a>
        )}
      </div>
      <div className="money-st-facts">
        {c.due && <DuePill due={c.due} />}
        <span className={`pill ${s.advance > 0 ? 'money-st-adv' : 'outline'}`}><Wallet size={11} aria-hidden="true" /> Advance {inr(s.advance)}</span>
        {days && <span className="pill outline">Leave this month: <b className="num">{leaves}</b></span>}
        {days && extras > 0 && <span className="pill outline">Extra: <b className="num">{extras}</b></span>}
      </div>
      <div className="money-st-actions">
        <button type="button" className="btn primary money-st-paybtn" onClick={() => setSheet('pay')} aria-label={`Pay ${c.title || 'staff'}`}>
          <Banknote size={20} aria-hidden="true" /> Pay
        </button>
        <button type="button" className="btn" onClick={() => setSheet('adv')}><HandCoins size={16} aria-hidden="true" /> Advance</button>
        {days && <button type="button" className="btn" onClick={() => setSheet('leave')}><CalendarMinus size={16} aria-hidden="true" /> Leave</button>}
        {days && <button type="button" className="btn" onClick={extraDay}><CalendarPlus size={16} aria-hidden="true" /> Extra day</button>}
      </div>
      <StaffPaySheet card={c} open={sheet === 'pay'} onClose={close} />
      <AdvanceSheet card={c} open={sheet === 'adv'} onClose={close} />
      <LeaveSheet card={c} open={sheet === 'leave'} onClose={close} />
    </li>
  );
}

/* ---------- add person ---------- */

function AddStaffSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useApp();
  const [name, setName] = useState('');
  const [role, setRole] = useState<typeof STAFF_ROLES[number]>('Maid');
  const [pay, setPay] = useState<number | undefined>();
  const [payDay, setPayDay] = useState('1');
  const [phone, setPhone] = useState('');
  const [adv, setAdv] = useState<number | undefined>();
  const [err, setErr] = useState('');
  const busy = useRef(false);
  useEffect(() => {
    if (!open) return;
    setName(''); setRole('Maid'); setPay(undefined); setPayDay('1'); setPhone(''); setAdv(undefined); setErr(''); busy.current = false;
  }, [open]);

  const save = async () => {
    if (busy.current) return;
    const day = parseInt(payDay, 10);
    if (!name.trim()) { setErr('Add a name'); return; }
    if (!pay) { setErr('Add the monthly pay'); return; }
    if (!(day >= 1 && day <= 31)) { setErr('Pay day is a day of the month, 1 to 31'); return; }
    busy.current = true;
    await createStaff({ name, role, pay, payDay: day, phone, advance: adv });
    toast(`${name.trim()} added`);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add person">
      <form className="money-st-pay" onSubmit={e => { e.preventDefault(); void save(); }}>
        <div className="field">
          <label htmlFor="st-name">Name</label>
          <input id="st-name" className="input" value={name} placeholder="Sunita didi" autoComplete="off" onChange={e => setName(e.target.value)} />
        </div>
        <ChipRow label="Role" options={STAFF_ROLES} value={role} onChange={setRole} />
        <div className="money-st-grid">
          <RupeeField id="st-pay" label="Monthly pay" value={pay} onValue={setPay} allowZero={false} />
          <div className="field">
            <label htmlFor="st-day">Pay day (day of month)</label>
            <input id="st-day" className="input num" inputMode="numeric" autoComplete="off" value={payDay} onChange={e => setPayDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </div>
          <div className="field">
            <label htmlFor="st-phone">Phone (optional)</label>
            <input id="st-phone" className="input num" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <RupeeField id="st-adv" label="Advance already given (optional)" value={adv} onValue={setAdv} />
        </div>
        {err && <span className="err" role="alert">{err}</span>}
        <button type="submit" className="btn primary block"><Plus size={18} aria-hidden="true" /> Add person</button>
      </form>
    </Sheet>
  );
}

/* ---------- Bills tab section ---------- */

export function StaffSection({ cards }: { cards: Card[] }) {
  const [adding, setAdding] = useState(false);
  const staff = cards.filter(c => c.type === 'bill' && !!c.staff && isActive(c))
    .sort((a, b) => a.rank - b.rank || (a.due ?? '').localeCompare(b.due ?? ''));
  const monthly = staff.reduce((s, c) => s + (c.amount ?? 0), 0);
  const festival = staff.length > 0 && isFestivalSeason(today().getMonth());

  return (
    <section className="money-card money-wide money-st" aria-labelledby="b-staff">
      <div className="money-h-row">
        <h2 id="b-staff" className="money-h">Staff</h2>
        {staff.length > 0 && <span className="num money-total">{inr(monthly)} a month</span>}
        <button type="button" className="btn money-st-add" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" /> Add person</button>
      </div>
      {festival && (
        <p className="money-st-festnote"><Gift size={16} aria-hidden="true" /> Festival bonus? Add it under "Bonus" when you pay.</p>
      )}
      {staff.length
        ? <ul className="money-st-list">{staff.map(c => <StaffRow key={c.id} c={c} />)}</ul>
        : <p className="money-muted">Keep pay, advances and leave for your maid, cook, driver or landlord in one place.</p>}
      <AddStaffSheet open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}

/* ---------- editor: ledger ---------- */

const ENTRY_LABEL: Record<StaffEntry['kind'], string> = { advance: 'Advance', paid: 'Paid', leave: 'Leave', extra: 'Extra day', bonus: 'Bonus' };

export function StaffLedger({ card, onChange }: { card: Card; onChange: (s: StaffInfo) => void }) {
  const s = card.staff!;
  const recent = recentLog(s.log, 10);
  const id = `stl-${card.id}`;
  const roleOk = (STAFF_ROLES as readonly string[]).includes(s.role);
  return (
    <section className="money-st-ledger" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="sec-label"><History size={13} aria-hidden="true" /> Staff ledger</h2>
      <ChipRow label="Role" options={STAFF_ROLES} value={roleOk ? s.role as typeof STAFF_ROLES[number] : 'Other'} onChange={v => onChange({ ...s, role: v })} />
      <div className="field">
        <label htmlFor={`${id}-ph`}>Phone</label>
        <input id={`${id}-ph`} className="input num" type="tel" inputMode="tel" autoComplete="off" value={s.phone ?? ''}
          onChange={e => onChange({ ...s, phone: e.target.value || undefined })} />
      </div>
      <p className="money-st-owed">
        <span className="money-k">Advance outstanding</span>
        <span className="num money-mid">{inr(s.advance)}</span>
      </p>
      {recent.length ? (
        <ul className="money-st-log">
          {recent.map(e => (
            <li key={e.id} className={`k-${e.kind}`}>
              <span className="num money-ap-date">{fmtDayMonth(e.date)}</span>
              <span className="money-st-logk">{ENTRY_LABEL[e.kind]}{e.note ? <span className="money-sub"> · {e.note}</span> : null}</span>
              <span className="num money-row-amt">
                {e.amount !== undefined ? inr(e.amount) : e.days !== undefined ? `${e.days} ${e.days === 1 ? 'day' : 'days'}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="money-muted">Nothing logged yet. Pay, advances and leave show up here.</p>}
    </section>
  );
}

