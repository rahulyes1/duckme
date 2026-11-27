/**
 * 10-second expense entry: amount on a number pad, one tap for the category, Save.
 * Stays open after saving so you can add another.
 */
import { motion } from 'framer-motion';
import { CalendarDays, Check, ChevronDown, ChevronUp, Delete, PencilLine, Plus, Star, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app-context';
import { createCard, logInvestment, newCard, withUndo } from '../../lib/actions';
import { saveSettings } from '../../lib/db';
import { addDaysISO, buzz, fmtDate, inr, prefersReducedMotion, today, todayISO } from '../../lib/format';
import { useCards, useSettings } from '../../lib/hooks';
import type { Card, InvestKind } from '../../lib/types';
import { PAY_MODES } from '../../lib/types';
import { Money } from '../../ui/bits';
import { Sheet } from '../../ui/Sheet';
import {
  budgetCrossing, budgetStatus, cashFlow, padDisplay, padPress, padValue, quickCategories, spentByCategory, toggleFav, usedCategories,
} from './cashflow';
import { monthKey } from './money-util';
import { catIcon } from './parts';
import { balanceText, buildSplit, knownPeople, myShare, type SplitDraft } from './split';
import { EMPTY_SPLIT, SplitPicker } from './splitPicker';
import { CaptureBar, type Fill } from './CaptureBar';
import { investKindFromText, looksDuplicate } from '../../lib/capture';

type Day = 'today' | 'yesterday' | 'pick';
const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '.'];
const FIRST = 5;

interface Saved {
  amount: number;
  category: string;
  date: string;
  /** Safe-to-spend before/after, or spent-this-month before/after when salary isn't set. */
  from: number;
  to: number;
  safe: boolean;
}

export default function QuickExpense({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cards = useCards();
  const settings = useSettings();
  const { toast } = useApp();

  const [amt, setAmt] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [mode, setMode] = useState<string>('UPI');
  const [day, setDay] = useState<Day>('today');
  const [picked, setPicked] = useState(todayISO());
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [all, setAll] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState<Saved | null>(null);
  const [splitOn, setSplitOn] = useState(false);
  const [splitDraft, setSplitDraft] = useState<SplitDraft>(EMPTY_SPLIT);
  const [splitErr, setSplitErr] = useState('');
  const [shown, setShown] = useState(0);
  const busy = useRef(false);
  /** Investment kind from the last SMS / voice fill (the SMS text itself isn't kept in the form). */
  const fillInvest = useRef<InvestKind | null>(null);
  const amtRef = useRef<HTMLInputElement>(null);
  const anotherRef = useRef<HTMLButtonElement>(null);

  const reset = useCallback(() => {
    setAmt(''); setCat(null); setNote(''); setNoteOpen(false); setErr(''); setDay('today'); setPicked(todayISO()); setAll(false);
    setSplitOn(false); setSplitDraft(EMPTY_SPLIT); setSplitErr('');
    fillInvest.current = null;
  }, []);
  useEffect(() => { if (open) { reset(); setMode('UPI'); setSaved(null); } }, [open, reset]);

  const month = monthKey(today());
  const order = useMemo(
    () => quickCategories(settings.favCategories, usedCategories(cards ?? [], month)),
    [cards, settings.favCategories, month],
  );
  const favs = settings.favCategories ?? [];
  const splitNames = useMemo(() => knownPeople(settings.splitPeople, cards ?? []), [settings.splitPeople, cards]);
  let visible = all ? order : order.slice(0, FIRST);
  if (!all && cat && !visible.includes(cat)) visible = [...order.slice(0, FIRST - 1), cat];

  const value = padValue(amt);
  const spentNow = useMemo(() => spentByCategory(cards ?? [], month), [cards, month]);
  const budgetHint = useMemo(() => {
    const b = cat ? settings.budgets[cat] : undefined;
    if (!cat || !b) return null;
    const after = (spentNow[cat] ?? 0) + (value || 0);
    const st = budgetStatus(after, b);
    return {
      level: st.level,
      text: st.level === 'over' ? `${cat}: this puts you ${inr(st.over)} over the ${inr(b)} budget`
        : `${cat}: ${inr(st.left)} of ${inr(b)} left${value ? ' after this' : ''}`,
    };
  }, [cat, settings.budgets, spentNow, value]);
  const date = day === 'today' ? todayISO() : day === 'yesterday' ? addDaysISO(todayISO(), -1) : picked;

  const press = useCallback((k: string) => {
    setErr('');
    setAmt(a => padPress(a, k));
  }, []);

  const save = async () => {
    if (busy.current || !cards) return;
    if (value <= 0) { setErr('Type an amount first'); amtRef.current?.focus(); return; }
    if (!date) { setErr('Pick a date'); return; }
    const sp = splitOn ? buildSplit(value, splitDraft) : null;
    if (sp?.error) { setSplitErr(sp.error); return; }
    busy.current = true;
    try {
      const category = cat ?? 'Other';
      const salary = settings.salaryAmount ?? 0;
      const ref = today();
      const before = cashFlow(cards, salary, settings.salaryDay, ref);
      // SIP, MF, PPF, FD… are money put away, not spent: log them on the investment instead.
      const kind = sp?.split ? null : investKindFromText(note) ?? fillInvest.current;
      if (kind) {
        const title = note.trim() || kind;
        const undo = await logInvestment({ amount: value, date, title, kind, mode });
        const line = newCard({ type: 'expense', title, amount: value, date, category: 'Investment', mode });
        const after = cashFlow([...cards, line], salary, settings.salaryDay, ref);
        toast(`Saved as investment (${kind} ${inr(value)}), not a spend.`, undo);
        buzz(15);
        const safe = salary > 0;
        const from = safe ? before.safeToday : before.spent;
        const to = safe ? after.safeToday : after.spent;
        setShown(from);
        setSaved({ amount: value, category: 'Investment', date, from, to, safe });
        reset();
        return;
      }
      const catBefore = spentByCategory(cards, date.slice(0, 7))[category] ?? 0;
      let created!: Card;
      const dup = looksDuplicate(cards, { amount: value, category, title: note.trim(), date }, Date.now());
      const undo = await withUndo(async () => {
        created = await createCard({ type: 'expense', title: note.trim() || category, amount: value, date, category, mode, ...(sp?.split ? { split: sp.split } : {}) });
      });
      const after = cashFlow([...cards, created], salary, settings.salaryDay, ref);

      const budget = settings.budgets[category];
      const crossed = budgetCrossing(catBefore, catBefore + value, budget);
      const st = budgetStatus(catBefore + value, budget);
      const msg = crossed === 'over'
        ? `${category} budget crossed: ${inr(st.over)} over ${inr(budget)}`
        : crossed === 'warn'
          ? `${category} budget ${st.pct}% used: ${inr(st.left)} left`
          : sp?.split
            ? `Saved ${inr(value)} · ${splitSummary(value, sp.split)}`
            : `Saved ${inr(value)} · ${category}`;
      toast(dup ? `Saved. Looks like the ${inr(value)} you logged a few minutes ago — tap Undo if it's a repeat.` : msg, undo);
      buzz(crossed ? [30, 60, 30] : 15);

      const safe = salary > 0;
      const from = safe ? before.safeToday : before.spent;
      const to = safe ? after.safeToday : after.spent;
      setShown(from);
      setSaved({ amount: value, category, date, from, to, safe });
      reset();
    } finally {
      busy.current = false;
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Count the safe-to-spend down (or the month's spend up) right after the check pops.
  useEffect(() => {
    if (!saved) return;
    anotherRef.current?.focus({ preventScroll: true });
    const t = window.setTimeout(() => setShown(saved.to), prefersReducedMotion() ? 0 : 260);
    return () => clearTimeout(t);
  }, [saved]);

  /** Fill the form from a pasted SMS, your voice, or a usual-spend chip. You still check and tap Save. */
  const fill = (f: Fill) => {
    if (f.amount) setAmt(String(f.amount));
    if (f.category) setCat(f.category);
    if (f.mode) setMode(f.mode);
    if (f.title) { setNote(f.title); setNoteOpen(true); }
    fillInvest.current = f.invest ?? investKindFromText(f.title);
    if (f.date) {
      const t = todayISO(), y = addDaysISO(t, -1);
      if (f.date === t) setDay('today'); else if (f.date === y) setDay('yesterday'); else { setDay('pick'); setPicked(f.date); }
    }
    setErr('');
    buzz(8);
    const what = [f.title, f.amount ? inr(f.amount) : ''].filter(Boolean).join(' · ');
    toast(f.from === 'sms' ? `Filled from SMS: ${what}. Check and Save.` : f.from === 'voice' ? `Heard: ${what}. Check and Save.` : `${what}. Tap Save.`);
  };

  // Opened from a shared bank SMS: fill the form (after the reset above has run).
  useEffect(() => {
    if (!open) return;
    try {
      const raw = sessionStorage.getItem('hisaab.prefill');
      if (!raw) return;
      sessionStorage.removeItem('hisaab.prefill');
      fill({ ...(JSON.parse(raw) as Fill), from: 'sms' });
    } catch { /* storage blocked */ }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const another = () => { setSaved(null); setTimeout(() => amtRef.current?.focus(), 30); };

  // Hardware keyboard: digits, dot, backspace, Enter. Text fields keep their own typing.
  const savedRef = useRef(saved);
  savedRef.current = saved;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const typing = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !t?.dataset.pad);
      if (e.key === 'Enter') {
        if (tag === 'BUTTON' || savedRef.current) return;
        e.preventDefault();
        void saveRef.current();
        return;
      }
      if (typing) return;
      let k: string | null = null;
      if (/^[0-9]$/.test(e.key)) k = e.key;
      else if (e.key === '.' || e.key === ',' || e.key === 'Decimal') k = '.';
      else if (e.key === 'Backspace') k = 'back';
      if (!k) return;
      e.preventDefault();
      if (savedRef.current) { if (k === 'back') return; setSaved(null); }
      press(k);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, press]);

  /* long-press a category to make it a favourite; a normal tap still selects it */
  const lp = useRef<{ t?: number; fired: boolean; x: number; y: number }>({ fired: false, x: 0, y: 0 });
  const cancelLp = () => clearTimeout(lp.current.t);
  const fav = async (k: string) => {
    const next = toggleFav(settings.favCategories, k);
    await saveSettings({ favCategories: next });
    buzz(25);
    toast(next.includes(k) ? `${k} pinned to the front` : `${k} removed from favourites`);
  };
  const catProps = (k: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      cancelLp();
      lp.current = { fired: false, x: e.clientX, y: e.clientY, t: window.setTimeout(() => { lp.current.fired = true; void fav(k); }, 520) };
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.hypot(e.clientX - lp.current.x, e.clientY - lp.current.y) > 10) cancelLp();
    },
    onPointerUp: cancelLp,
    onPointerCancel: cancelLp,
    onPointerLeave: cancelLp,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => {
      if (lp.current.fired) { lp.current.fired = false; return; }
      setCat(c => (c === k ? null : k));
    },
  });

  const reduce = prefersReducedMotion();

  return (
    <Sheet open={open} onClose={onClose} title="Add expense" hideTitle>
      {saved ? (
        <div className="money-qe-done" aria-live="polite">
          <motion.span className="money-qe-check" aria-hidden="true"
            initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}>
            <Check size={34} strokeWidth={3} />
          </motion.span>
          <p className="money-qe-saved">
            Saved <b className="num">{inr(saved.amount)}</b> · {saved.category}
            {saved.date !== todayISO() && <> · <span className="num">{fmtDate(saved.date)}</span></>}
          </p>
          <div className="money-qe-safe">
            <span className="money-k">{saved.safe ? 'Safe to spend today' : 'Spent this month'}</span>
            <Money value={shown} className="money-big" />
            {saved.safe && saved.to === 0 && <span className="money-qe-over">Nothing left to spend safely until salary.</span>}
          </div>
          <div className="money-qe-actions">
            <button type="button" className="btn" onClick={onClose}>Done</button>
            <button ref={anotherRef} type="button" className="btn primary" onClick={another}><Plus size={18} aria-hidden="true" /> Add another</button>
          </div>
        </div>
      ) : (
        <div className="money-qe">
          <CaptureBar cards={cards ?? []} onFill={fill} onError={msg => setErr(msg)} />
          <div className="money-qe-display">
            <label htmlFor="qe-amt" className="money-k">Amount spent</label>
            <div className="money-qe-amt">
              <span aria-hidden="true">₹</span>
              <input
                ref={amtRef} id="qe-amt" data-pad="1" className="num" readOnly inputMode="none" placeholder="0" autoComplete="off"
                value={amt ? padDisplay(amt) : ''} aria-invalid={!!err} aria-describedby={err ? 'qe-err' : 'qe-hint'}
              />
              <button type="button" className="icon-btn" aria-label="Delete last digit" disabled={!amt} onClick={() => press('back')}>
                <Delete size={22} aria-hidden="true" />
              </button>
            </div>
            {err ? <span className="money-qe-err" id="qe-err" role="alert">{err}</span>
              : <span className="sr-only" id="qe-hint">Use the number pad below or your keyboard.</span>}
          </div>

          <div className="money-qe-pad" role="group" aria-label="Number pad">
            {PAD.map(k => (
              <button key={k} type="button" className="money-qe-key num" onClick={() => press(k)}
                aria-label={k === '.' ? 'Decimal point' : k === '00' ? 'Double zero' : k}>{k}</button>
            ))}
          </div>

          <div className="money-qe-sec">
            <span className="money-qe-label" id="qe-cat">Category <span>Hold one to make it a favourite</span></span>
            {budgetHint && <span className={`money-qe-bhint money-lvl-text-${budgetHint.level}`} aria-live="polite">{budgetHint.text}</span>}
            <div className="money-qe-cats" role="group" aria-labelledby="qe-cat">
              {visible.map(k => {
                const Icon = catIcon(k);
                const isFav = favs.includes(k);
                return (
                  <button key={k} type="button" className="money-qe-cat" aria-pressed={cat === k}
                    aria-label={isFav ? `${k}, favourite` : k} {...catProps(k)}>
                    <Icon size={20} aria-hidden="true" />
                    <span>{k}</span>
                    {isFav && <Star size={12} className="money-qe-star" aria-hidden="true" fill="currentColor" />}
                  </button>
                );
              })}
              <button type="button" className="money-qe-cat more" aria-expanded={all} onClick={() => setAll(a => !a)}>
                {all ? <ChevronUp size={20} aria-hidden="true" /> : <ChevronDown size={20} aria-hidden="true" />}
                <span>{all ? 'Fewer' : 'More'}</span>
              </button>
            </div>
          </div>

          <div className="money-qe-sec">
            <span className="money-qe-label" id="qe-mode">Paid with</span>
            <div className="chips money-qe-chips" role="group" aria-labelledby="qe-mode">
              {PAY_MODES.map(m => (
                <button key={m} type="button" className="chip" aria-pressed={mode === m} onClick={() => setMode(m)}>{m}</button>
              ))}
            </div>
          </div>

          <div className="money-qe-sec">
            <span className="money-qe-label" id="qe-split">Shared with flatmates or friends?</span>
            <div className="chips money-qe-chips" role="group" aria-labelledby="qe-split">
              <button type="button" className="chip" aria-pressed={splitOn} aria-expanded={splitOn}
                onClick={() => { setSplitOn(o => !o); setSplitErr(''); }}>
                <Users size={16} aria-hidden="true" /> Split
              </button>
            </div>
            {splitOn && (
              <SplitPicker amount={value} draft={splitDraft} known={splitNames} saved={settings.splitPeople} error={splitErr}
                onChange={dft => { setSplitDraft(dft); setSplitErr(''); }} />
            )}
          </div>

          <div className="money-qe-sec">
            <span className="money-qe-label" id="qe-when">When</span>
            <div className="chips money-qe-chips" role="group" aria-labelledby="qe-when">
              <button type="button" className="chip" aria-pressed={day === 'today'} onClick={() => setDay('today')}>Today</button>
              <button type="button" className="chip" aria-pressed={day === 'yesterday'} onClick={() => setDay('yesterday')}>Yesterday</button>
              <button type="button" className="chip" aria-pressed={day === 'pick'} onClick={() => setDay('pick')}>
                <CalendarDays size={16} aria-hidden="true" /> {day === 'pick' && picked ? fmtDate(picked) : 'Other day'}
              </button>
              {!noteOpen && (
                <button type="button" className="chip" onClick={() => { setNoteOpen(true); setTimeout(() => document.getElementById('qe-note')?.focus(), 30); }}>
                  <PencilLine size={16} aria-hidden="true" /> Add note
                </button>
              )}
            </div>
            {day === 'pick' && (
              <div className="field money-qe-field">
                <label htmlFor="qe-date">Date</label>
                <input id="qe-date" type="date" className="input num" value={picked} max={todayISO()} onChange={e => setPicked(e.target.value)} />
              </div>
            )}
            {noteOpen && (
              <div className="field money-qe-field">
                <label htmlFor="qe-note">Note (optional)</label>
                <input id="qe-note" className="input" value={note} placeholder="Lunch with team, auto to office" autoComplete="off"
                  enterKeyHint="done" onChange={e => setNote(e.target.value)} />
              </div>
            )}
          </div>

          {/* Always visible at the bottom of the sheet, however small the phone. */}
          <div className="sheet-actions">
            <button type="button" className="btn primary block money-qe-save" onClick={() => void save()} aria-disabled={value <= 0}>
              <Check size={20} aria-hidden="true" /> Save{value > 0 ? ` ${inr(value)}` : ''}{cat ? ` · ${cat}` : ''}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** "Rohan owes you ₹400" for one person, or "split with 3" for more. */
function splitSummary(amount: number, split: NonNullable<Card['split']>): string {
  if (split.people.length === 1) {
    const p = split.people[0];
    const net = split.paidBy === 'me' ? p.share : -myShare(amount, split);
    return balanceText({ name: p.name, net });
  }
  return `split with ${split.people.length}`;
}
