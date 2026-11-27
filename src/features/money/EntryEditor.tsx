import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, CheckCircle2, Copy, IndianRupee, Link2, MoreVertical, Palette, Pin, PinOff, Receipt, StickyNote, CheckSquare, Trash2, TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../app-context';
import { convert, duplicate, trash, updateCard } from '../../lib/actions';
import { payBillAsking } from './CardPaySheet';
import { db } from '../../lib/db';
import { addDaysISO, fmtDate, fmtDateY, inr, nextSalary, salarySide, toISO } from '../../lib/format';
import { useCard, useSettings } from '../../lib/hooks';
import type { Card, CardColor, InvestInfo, Repeat } from '../../lib/types';
import { EXPENSE_CATEGORIES, INVEST_KINDS, KIND_LABEL, PAY_MODES } from '../../lib/types';
import { DuePill } from '../../ui/CardTile';
import { ColorPicker, Switch } from '../../ui/bits';
import { Sheet } from '../../ui/Sheet';
import { fmtPlain, hasMaturity, isMonthly, paidMessage, parseAmount, REPEAT_LABEL } from './money-util';
import './money.css';
import { isActive } from '../../lib/types';
import { AutopayFields } from './autopay-ui';
import { StaffLedger, StaffPaySheet } from './staff-ui';
import { gainLoss } from '../../lib/logic';

const REPEATS: Repeat[] = ['none', 'monthly', 'quarterly', 'yearly'];
const TYPE_ICON = { expense: IndianRupee, bill: Receipt, invest: TrendingUp, note: StickyNote, task: CheckSquare } as const;

function Chips<T extends string>({ label, options, value, onChange, render }: {
  label: string; options: readonly T[]; value: T | undefined; onChange: (v: T) => void; render?: (v: T) => string;
}) {
  const id = `chips-${label.replace(/\s/g, '-').toLowerCase()}`;
  return (
    <div className="field">
      <span className="label" id={id}>{label}</span>
      <div className="money-chips" role="group" aria-labelledby={id}>
        {options.map(o => (
          <button key={o} type="button" className="chip" aria-pressed={value === o} onClick={() => onChange(o)}>{render ? render(o) : o}</button>
        ))}
      </div>
    </div>
  );
}

/** Text field for rupee amounts: numeric keypad, strips commas, Indian grouping on blur, validate on blur. */
function AmountField({ id, label, value, onValue, big, allowZero, required }: {
  id: string; label: string; value: number | undefined; onValue: (n: number | undefined) => void; big?: boolean; allowZero?: boolean; required?: boolean;
}) {
  const [text, setText] = useState(() => fmtPlain(value));
  const [err, setErr] = useState('');
  const focused = useRef(false);
  // Only complain about an empty box after the user has typed in it. Showing an error line on a
  // plain blur pushed every control below it down mid-tap, so the tap landed on the wrong thing.
  const dirty = useRef(false);
  useEffect(() => { if (!focused.current) setText(fmtPlain(value)); }, [value]);

  const check = (raw: string): string => {
    const n = parseAmount(raw);
    if (!raw.trim()) return required && dirty.current ? 'Enter an amount' : '';
    if (n === null) return 'Use numbers only, like 1,250';
    if (allowZero ? n < 0 : n <= 0) return allowZero ? 'Amount can’t be negative' : 'Amount must be more than ₹0';
    return '';
  };
  return (
    <div className={`field ${big ? 'money-amount' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="money-rupee-input">
        <span aria-hidden="true">₹</span>
        <input
          id={id} className="input num" inputMode="decimal" autoComplete="off" placeholder="0"
          value={text} aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined}
          onFocus={() => { focused.current = true; }}
          onChange={e => {
            const raw = e.target.value;
            dirty.current = true;
            setText(raw);
            if (err && !check(raw)) setErr('');
            const n = parseAmount(raw);
            if (!raw.trim()) onValue(undefined);
            else if (n !== null && (allowZero ? n >= 0 : n > 0)) onValue(n);
          }}
          onBlur={e => {
            focused.current = false;
            const raw = e.target.value;
            const msg = check(raw);
            setErr(msg);
            const n = parseAmount(raw);
            if (!msg && n !== null) setText(fmtPlain(n));
          }}
        />
      </div>
      {err && <span className="err" id={`${id}-err`} role="alert">{err}</span>}
    </div>
  );
}

function DateField({ id, label, value, onChange, required, help }: {
  id: string; label: string; value: string | undefined; onChange: (v: string | undefined) => void; required?: boolean; help?: string;
}) {
  const [err, setErr] = useState('');
  const desc = [help ? `${id}-help` : '', err ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="date" className="input num" value={value ?? ''} aria-invalid={!!err} aria-describedby={desc}
        onChange={e => {
          // A required date can't be cleared (the box snaps back), so there is no error to show on blur.
          if (!e.target.value && required) { setErr('This date is needed'); return; }
          setErr('');
          onChange(e.target.value || undefined);
        }} />
      {help && <span className="help" id={`${id}-help`}>{help}</span>}
      {err && <span className="err" id={`${id}-err`} role="alert">{err}</span>}
    </div>
  );
}

function LinkedCards({ ids }: { ids: string[] }) {
  const { openCard } = useApp();
  const linked = useLiveQuery(async () => (await db.cards.bulkGet(ids)).filter((c): c is Card => !!c && c.status !== 'trashed'), [ids.join(',')]);
  if (!ids.length || !linked?.length) return null;
  return (
    <section className="money-linked" aria-labelledby="linked-h">
      <h2 id="linked-h" className="sec-label"><Link2 size={13} aria-hidden="true" /> Linked cards</h2>
      <ul className="money-list">
        {linked.map(c => {
          const Icon = TYPE_ICON[c.type];
          return (
            <li key={c.id}>
              <button type="button" className="money-mini" data-color={c.color} onClick={e => openCard(c.id, e.currentTarget)}>
                <span className="money-mini-text">
                  <span className="money-row-title"><Icon size={14} aria-hidden="true" /> {c.title || 'Untitled'}</span>
                  <span className="money-sub">{KIND_LABEL[c.type]}{c.date ? ` · ${fmtDate(c.date)}` : c.due ? ` · due ${fmtDate(c.due)}` : ''}</span>
                </span>
                {c.amount !== undefined && <span className="money-row-amt num">{inr(c.amount)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function EntryEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const card = useCard(id);
  const settings = useSettings();
  const { toast, burst, openCard } = useApp();
  const [draft, setDraft] = useState<Card | null>(null);
  const pending = useRef<Partial<Card>>({});
  /** Edits being written right now. Kept on top of the DB copy until the write lands, so a live-query
   *  update that arrives mid-write can't flip a switch or chip back for a moment. */
  const inflight = useRef<Partial<Card>>({});
  const timer = useRef<number>();
  const [sheet, setSheet] = useState<'color' | 'more' | 'staffpay' | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);

  // Keep the draft in step with the database, but never overwrite edits not yet saved.
  useEffect(() => { if (card) setDraft({ ...card, ...inflight.current, ...pending.current }); }, [card]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!Object.keys(p).length) return;
    pending.current = {};
    inflight.current = { ...inflight.current, ...p };
    try {
      await updateCard(id, p);
    } finally {
      const rest = { ...inflight.current } as Record<string, unknown>;
      for (const k of Object.keys(p)) if (rest[k] === (p as Record<string, unknown>)[k]) delete rest[k];
      inflight.current = rest as Partial<Card>;
    }
  }, [id]);

  useEffect(() => () => { void flush(); }, [flush]);

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const set = (patch: Partial<Card>) => {
    const cur = draftRef.current;
    if (!cur) return;
    // Only record keys that actually change, so opening and closing writes nothing.
    const changed: Partial<Card> = {};
    for (const k of Object.keys(patch) as (keyof Card)[]) {
      if (JSON.stringify(cur[k]) !== JSON.stringify(patch[k])) (changed as Record<string, unknown>)[k] = patch[k];
    }
    if (!Object.keys(changed).length) return;
    pending.current = { ...pending.current, ...changed };
    const next = { ...cur, ...changed };
    draftRef.current = next;
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, 300);
  };
  const setInvest = (p: Partial<InvestInfo>) => {
    const cur = draftRef.current?.invest ?? { kind: 'SIP' as const };
    set({ invest: { ...cur, ...p } });
  };

  if (!draft) return null;
  const c = draft;
  const kind = c.invest?.kind;
  const monthly = isMonthly(kind);

  const back = async () => { await flush(); onClose(); };

  const gl = gainLoss(c);

  const markPaid = async (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    await flush();
    const r = await payBillAsking(c);
    if (!r) return;
    burst(rect);
    toast(paidMessage(c, r.nextDue, r.expense), r.undo);
    // The paid bill is now done; a repeating bill has a new card for the next due date.
    onClose();
  };

  const doDuplicate = async () => {
    setSheet(null);
    await flush();
    const copy = await duplicate(id);
    if (copy) { toast('Copy made'); openCard(copy.id); }
  };
  const doConvert = async (type: 'note' | 'task') => {
    setSheet(null);
    await flush();
    const undo = await convert(id, type);
    toast(`Changed to ${KIND_LABEL[type].toLowerCase()}`, undo);
  };
  const doTrash = async () => {
    setSheet(null);
    await flush();
    const undo = await trash(id);
    onClose();
    toast('Moved to trash', undo);
  };

  const salDate = toISO(nextSalary(settings.salaryDay));
  const titleLabel = c.type === 'expense' ? 'What was it for' : c.type === 'bill' ? 'Bill name' : 'Name';
  const titlePh = c.type === 'expense' ? 'Lunch, auto, groceries' : c.type === 'bill' ? 'Credit card, rent, electricity' : 'Index fund SIP, SBI FD';
  const amountLabel = c.type === 'invest' ? (monthly ? 'Monthly amount' : 'Amount invested') : c.type === 'bill' ? 'Amount due' : 'Amount spent';

  return (
    <div className="editor-scroll money-editor">
      <div className="editor-top">
        <button type="button" className="icon-btn" aria-label="Back" onClick={back}><ArrowLeft size={22} aria-hidden="true" /></button>
        <span className="money-editor-kind">{c.type === 'invest' && kind ? kind : KIND_LABEL[c.type]}</span>
        <div className="money-editor-actions">
          <button type="button" className="icon-btn" aria-pressed={c.pinned} aria-label={c.pinned ? 'Unpin' : 'Pin'} onClick={() => set({ pinned: !c.pinned })}>
            {c.pinned ? <PinOff size={20} aria-hidden="true" /> : <Pin size={20} aria-hidden="true" />}
          </button>
          <button type="button" className="icon-btn" aria-label="Card colour" onClick={() => setSheet('color')}><Palette size={20} aria-hidden="true" /></button>
          <button type="button" className="icon-btn" aria-label="More actions" aria-haspopup="dialog" onClick={() => setSheet('more')}><MoreVertical size={20} aria-hidden="true" /></button>
        </div>
      </div>

      <div className="money-form">
        <AmountField id={`amt-${id}`} label={amountLabel} value={c.amount} big required={c.type !== 'bill'}
          onValue={n => set({ amount: n })} />

        <div className="field">
          <label htmlFor={`title-${id}`}>{titleLabel}</label>
          <input id={`title-${id}`} className="input" value={c.title} placeholder={titlePh} autoComplete="off"
            onChange={e => set({ title: e.target.value })} />
        </div>

        {c.type === 'expense' && (
          <>
            <DateField id={`date-${id}`} label="Date" value={c.date} required onChange={v => set({ date: v })} />
            <Chips label="Category" options={EXPENSE_CATEGORIES} value={c.category as typeof EXPENSE_CATEGORIES[number]} onChange={v => set({ category: v })} />
            <Chips label="Paid with" options={PAY_MODES} value={c.mode as typeof PAY_MODES[number]} onChange={v => set({ mode: v })} />
          </>
        )}

        {c.type === 'bill' && (
          <>
            <DateField id={`due-${id}`} label="Due date" value={c.due} required onChange={v => set({ due: v })} />
            {c.due && (
              <div className="money-readout" aria-live="polite">
                <DuePill due={c.due} />
                <span className="pill outline">
                  {salarySide(c.due, settings.salaryDay) === 'before' ? `Before salary (${fmtDate(salDate)})` : `After salary (${fmtDate(salDate)})`}
                </span>
                {c.lastSafe && <span className="pill outline">Last safe day {fmtDateY(addDaysISO(c.due, 3))}</span>}
              </div>
            )}
            <Chips label="Repeats" options={REPEATS} value={c.repeat ?? 'none'} onChange={v => set({ repeat: v })} render={v => REPEAT_LABEL[v]} />
            <div className="money-switches">
              <Switch checked={!!c.autorenew} onChange={v => set({ autorenew: v })} label="Auto-renews (subscription)" />
              <Switch checked={!!c.lastSafe} onChange={v => set({ lastSafe: v })} label="Credit card style (show last safe day = due + 3)" />
            </div>
            <div className="field">
              <label htmlFor={`pen-${id}`}>Penalty hint</label>
              <input id={`pen-${id}`} className="input" value={c.penalty ?? ''} placeholder="Late fee ₹900 + GST" autoComplete="off"
                aria-describedby={`pen-${id}-help`} onChange={e => set({ penalty: e.target.value || undefined })} />
              <span className="help" id={`pen-${id}-help`}>Shown as a reminder only. It never changes the order.</span>
            </div>
            <AutopayFields card={c} settings={settings} onChange={v => set({ autopay: v })} />
            <Chips label="Category" options={EXPENSE_CATEGORIES} value={c.category as typeof EXPENSE_CATEGORIES[number]} onChange={v => set({ category: v })} />
            {c.staff && <StaffLedger card={c} onChange={v => set({ staff: v })} />}
            {isActive(c) && (
              <button type="button" className="btn primary block money-markpaid"
                onClick={e => { if (c.staff) { void flush(); setSheet('staffpay'); } else void markPaid(e.currentTarget); }}>
                <CheckCircle2 size={18} aria-hidden="true" /> {c.staff ? 'Pay' : 'Mark paid'}{c.amount ? ` ${inr(c.amount)}` : ''}
              </button>
            )}
            {c.status === 'done' && <p className="money-muted"><CheckCircle2 size={14} aria-hidden="true" /> Paid{c.doneAt ? ` on ${fmtDate(toISO(new Date(c.doneAt)))}` : ''}.</p>}
          </>
        )}

        {c.type === 'invest' && (
          <>
            <Chips label="Kind" options={INVEST_KINDS} value={kind} onChange={v => setInvest({ kind: v })} />
            {monthly && <DateField id={`next-${id}`} label="Next instalment" value={c.invest?.next} onChange={v => setInvest({ next: v })} />}
            {hasMaturity(kind) && <DateField id={`mat-${id}`} label="Maturity date" value={c.invest?.maturity} onChange={v => setInvest({ maturity: v })} />}
            {monthly && <AmountField id={`inv-${id}`} label="Total invested so far" value={c.invest?.invested} allowZero onValue={n => setInvest({ invested: n })} />}
            <AmountField id={`val-${id}`} label="Current value" value={c.invest?.value} allowZero onValue={n => setInvest({ value: n })} />
            {gl && (
              <p className={`money-gl num ${gl.diff >= 0 ? 'up' : 'down'}`} aria-live="polite">
                {gl.diff >= 0 ? 'Gain' : 'Loss'}: {inr(Math.abs(gl.diff))} ({Math.abs(gl.pct).toFixed(1)}%)
              </p>
            )}
            {monthly && <AutopayFields card={c} settings={settings} onChange={v => set({ autopay: v })} />}
            <p className="money-muted">Values are what you enter. Hisaab doesn't give buy/sell advice.</p>
          </>
        )}

        <div className="field">
          <label htmlFor={`body-${id}`}>Note</label>
          <textarea id={`body-${id}`} className="textarea" value={c.body} placeholder="Anything to remember"
            onChange={e => set({ body: e.target.value })} />
        </div>

        <LinkedCards ids={c.links} />
      </div>

      <Sheet open={sheet === 'color'} onClose={closeSheet} title="Card colour">
        <ColorPicker value={c.color} onChange={(v: CardColor) => { set({ color: v }); }} />
      </Sheet>
      {c.staff && <StaffPaySheet card={c} open={sheet === 'staffpay'} onClose={closeSheet} onPaid={onClose} />}
      <Sheet open={sheet === 'more'} onClose={closeSheet} title="More">
        <div className="money-more">
          <button type="button" className="btn block" onClick={doDuplicate}><Copy size={18} aria-hidden="true" /> Duplicate</button>
          <button type="button" className="btn block" onClick={() => doConvert('note')}><StickyNote size={18} aria-hidden="true" /> Convert to note</button>
          <button type="button" className="btn block" onClick={() => doConvert('task')}><CheckSquare size={18} aria-hidden="true" /> Convert to task</button>
          <button type="button" className="btn danger block" onClick={doTrash}><Trash2 size={18} aria-hidden="true" /> Move to trash</button>
        </div>
      </Sheet>
    </div>
  );
}
