/**
 * 10-second expense entry: amount on a number pad (it can add up: 300 + 200 + 50), one tap for the
 * category, Save. Everything fits on one screen. Stays open after saving so you can add another.
 */
import { motion } from 'framer-motion';
import { Check, ChevronDown, Delete, Plus, Star, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app-context';
import { createCard, logInvestment, newCard, withUndo } from '../../lib/actions';
import { getSettings, saveSettings } from '../../lib/db';
import { addDaysISO, buzz, fmtDate, inr, prefersReducedMotion, today, todayISO, uid } from '../../lib/format';
import { useCards, useSettings } from '../../lib/hooks';
import type { Card, InvestKind } from '../../lib/types';
import { PAY_MODES } from '../../lib/types';
import { Money } from '../../ui/bits';
import { Sheet } from '../../ui/Sheet';
import { buildDraft } from '../home/draft';
import { parse } from '../../lib/parse';
import { allCategories } from '../../lib/income';
import {
  budgetCrossing, budgetStatus, cashFlow, padDisplay, padHasOp, padPress, padValue, quickCategories, spentByCategory, toggleFav, usedCategories,
} from './cashflow';
import { guessCategory, monthKey } from './money-util';
import { catIcon } from './parts';
import { balanceText, buildSplit, knownPeople, myShare, type SplitDraft } from './split';
import { EMPTY_SPLIT, SplitPicker } from './splitPicker';
import { CaptureBar, type Fill } from './CaptureBar';
import { categoryForNote, investKindFromText, looksDuplicate } from '../../lib/capture';

type Day = 'today' | 'yesterday' | 'pick';
const nowTime = () => new Date().toTimeString().slice(0, 5);
/** 4 columns: 7 8 9 ⌫ | 4 5 6 − | 1 2 3 + | 00 0 . = */
const PAD = ['7', '8', '9', 'back', '4', '5', '6', '-', '1', '2', '3', '+', '00', '0', '.', '='];
const KEY_LABEL: Record<string, string> = { back: 'Delete last', '-': 'Minus', '+': 'Plus', '=': 'Equals, show the total', '.': 'Decimal point', '00': 'Double zero' };

interface Saved {
  amount: number;
  category: string;
  date: string;
  /** Safe-to-spend before/after, or spent-this-month before/after when salary isn't set. */
  from: number;
  to: number;
  safe: boolean;
}

export default function QuickExpense({ open, onClose, kind = 'expense' }: { open: boolean; onClose: () => void; kind?: 'expense' | 'income' }) {
  const cards = useCards();
  const settings = useSettings();
  const { toast } = useApp();

  const [entry, setEntry] = useState<'expense' | 'income'>(kind);
  const [account, setAccount] = useState('Main');
  const [time, setTime] = useState(nowTime);
  const [typed, setTyped] = useState('');
  const [newCat, setNewCat] = useState<string | null>(null);
  const isIncome = entry === 'income';
  const [amt, setAmt] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  /** True while the category was picked for you (last time's, or guessed from the note): the note may still change it. */
  const catAuto = useRef(true);
  const [mode, setMode] = useState<string>('UPI');
  const [day, setDay] = useState<Day>('today');
  const [picked, setPicked] = useState(todayISO());
  const [note, setNote] = useState('');
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

  /** Clears what changes per spend. Category and paid-with stay, so the next one is quicker. */
  const reset = useCallback(() => {
    setAmt(''); setNote(''); setErr(''); setDay('today'); setPicked(todayISO());
    setSplitOn(false); setSplitDraft(EMPTY_SPLIT); setSplitErr('');
    fillInvest.current = null;
    catAuto.current = true;
    setTime(nowTime()); setTyped(''); setNewCat(null);
  }, []);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    if (!open) return;
    reset(); setSaved(null); setEntry(kind);
    // Preselect what you used last time (an SMS / voice fill below can still override it).
    const s = settingsRef.current;
    setCat(s.lastExpenseCategory && allCategories(s.customCategories).includes(s.lastExpenseCategory) ? s.lastExpenseCategory : null);
    catAuto.current = true;
    setMode(s.lastExpenseMode && (PAY_MODES as readonly string[]).includes(s.lastExpenseMode) ? s.lastExpenseMode : 'UPI');
  }, [open, kind, reset]);

  const month = monthKey(today());
  const lastCat = settings.lastExpenseCategory;
  const order = useMemo(() => {
    const q = quickCategories(settings.favCategories, usedCategories(cards ?? [], month), settings.customCategories);
    return lastCat && q.includes(lastCat) ? [lastCat, ...q.filter(k => k !== lastCat)] : q;
  }, [cards, settings.favCategories, settings.customCategories, month, lastCat]);
  const lastMode = settings.lastExpenseMode;
  const modes = useMemo(
    () => (lastMode && (PAY_MODES as readonly string[]).includes(lastMode) ? [lastMode, ...PAY_MODES.filter(m => m !== lastMode)] : [...PAY_MODES]),
    [lastMode],
  );
  const favs = settings.favCategories ?? [];
  const splitNames = useMemo(() => knownPeople(settings.splitPeople, cards ?? []), [settings.splitPeople, cards]);

  const value = padValue(amt);
  const isSum = padHasOp(amt);
  /** A sum like "100 − 300" that comes to nothing can't be saved. */
  const sumBad = isSum && value <= 0;
  const spentNow = useMemo(() => spentByCategory(cards ?? [], month), [cards, month]);
  const budgetHint = useMemo(() => {
    const b = cat ? settings.budgets[cat] : undefined;
    if (isIncome || !cat || !b) return null;
    const after = (spentNow[cat] ?? 0) + (value || 0);
    const st = budgetStatus(after, b);
    return {
      level: st.level,
      text: st.level === 'over' ? `${cat}: this puts you ${inr(st.over)} over the ${inr(b)} budget`
        : `${cat}: ${inr(st.left)} of ${inr(b)} left${value ? ' after this' : ''}`,
    };
  }, [isIncome, cat, settings.budgets, spentNow, value]);
  const date = day === 'today' ? todayISO() : day === 'yesterday' ? addDaysISO(todayISO(), -1) : picked;

  const press = useCallback((k: string) => {
    setErr('');
    setAmt(a => padPress(a, k));
    if (!prefersReducedMotion()) buzz(8);
  }, []);

  // Long sums: keep the end of what you're typing in view.
  useEffect(() => {
    const el = amtRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [amt]);

  const save = async () => {
    if (busy.current || !cards) return;
    if (sumBad) { setErr("Total can't be zero or less"); return; }
    if (value <= 0) { setErr('Type an amount first'); amtRef.current?.focus(); return; }
    if (!date) { setErr('Pick a date'); return; }
    if (isIncome) {
      busy.current = true;
      try {
        const before = settings.incomes ?? [];
        const item = { id: uid(), date, amount: value, title: note.trim() || 'Income', createdAt: Date.now(), ...(account !== 'Main' ? { account } : {}) };
        await saveSettings({ incomes: [...before, item] });
        toast(`Added income ${inr(value)}`, async () => {
          const cur = await getSettings();
          await saveSettings({ incomes: (cur.incomes ?? []).filter(i => i.id !== item.id) });
        });
        reset(); onClose();
      } finally { busy.current = false; }
      return;
    }
    const sp = splitOn ? buildSplit(value, splitDraft) : null;
    if (sp?.error) { setSplitErr(sp.error); return; }
    busy.current = true;
    try {
      // Nothing picked: guess from the note ("chai" → Food) instead of filing it under Other.
      const category = cat ?? guessCategory(note);
      // No note but the amount was a sum: keep the sum as the note ("300 + 200 + 50").
      const text = note.trim() || (isSum ? padDisplay(amt.replace(/[+\-.]$/, '')) : '');
      // Remember category and paid-with for next time.
      const remember = () => saveSettings({ ...(cat ? { lastExpenseCategory: cat } : {}), lastExpenseMode: mode }).catch(() => { /* not critical */ });
      const salary = settings.salaryAmount ?? 0;
      const ref = today();
      const before = cashFlow(cards, salary, settings.salaryDay, ref, settings.incomes);
      // SIP, MF, PPF, FD… are money put away, not spent: log them on the investment instead.
      const kind = sp?.split ? null : investKindFromText(note) ?? fillInvest.current;
      if (kind) {
        const title = text || kind;
        const undo = await logInvestment({ amount: value, date, title, kind, mode });
        void remember();
        const line = newCard({ type: 'expense', title, amount: value, date, category: 'Investment', mode });
        const after = cashFlow([...cards, line], salary, settings.salaryDay, ref, settings.incomes);
        toast(`Saved as investment (${kind} ${inr(value)}), not a spend.`, undo);
        buzz(15);
        const safe = salary > 0;
        const from = safe ? before.safeToday : before.spent + before.onCard;
        const to = safe ? after.safeToday : after.spent + after.onCard;
        setShown(from);
        setSaved({ amount: value, category: 'Investment', date, from, to, safe });
        reset();
        return;
      }
      const catBefore = spentByCategory(cards, date.slice(0, 7))[category] ?? 0;
      let created!: Card;
      const dup = looksDuplicate(cards, { amount: value, category, title: text, date }, Date.now());
      const undo = await withUndo(async () => {
        created = await createCard({ type: 'expense', title: text || category, amount: value, date, category, mode, ...(time ? { time } : {}), ...(account !== 'Main' ? { account } : {}), ...(sp?.split ? { split: sp.split } : {}) });
      });
      void remember();
      const after = cashFlow([...cards, created], salary, settings.salaryDay, ref, settings.incomes);

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
      const from = safe ? before.safeToday : before.spent + before.onCard;
      const to = safe ? after.safeToday : after.spent + after.onCard;
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
    if (f.category) { setCat(f.category); catAuto.current = false; }
    if (f.mode) setMode(f.mode);
    if (f.title) setNote(f.title);
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

  /** Typing the note picks the category for you ("chai" → Food), unless you tapped one yourself. */
  const onNote = (v: string) => {
    setNote(v);
    if (!catAuto.current) return;
    const g = categoryForNote(cards ?? [], v);
    if (!g || !allCategories(settings.customCategories).includes(g)) return;
    setCat(g);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`.money-qe-cat[data-cat="${CSS.escape(g)}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
  };

  /** "bijli 2400 15th" → a bill; "chai 40" → fills this spend. */
  const draft = useMemo(() => (typed.trim() ? buildDraft(typed, null) : null), [typed]);
  const useTyped = async () => {
    if (!draft) return;
    const p = draft.partial;
    if (draft.type === 'expense' || draft.type === 'note') {
      if (!p.amount) { setErr('Add an amount, like “chai 40”'); return; }
      const parsed = parse(typed.trim());
      setAmt(String(p.amount));
      setNote(parsed.title || '');
      if (parsed.category !== 'Other') { setCat(parsed.category); catAuto.current = false; }
      if (parsed.date) { setDay('pick'); setPicked(parsed.date); }
      setTyped(''); setErr('');
      return;
    }
    const undo = await withUndo(async () => { await createCard(p); });
    toast(`Added ${draft.summary}`, undo);
    setTyped(''); setErr(''); onClose();
  };

  const addCategory = async () => {
    const name = (newCat ?? '').trim().replace(/\s+/g, ' ');
    if (!name) { setNewCat(null); return; }
    const existing = allCategories(settings.customCategories).find(c => c.toLowerCase() === name.toLowerCase());
    if (!existing) await saveSettings({ customCategories: [...(settings.customCategories ?? []), name] });
    setCat(existing ?? name); catAuto.current = false; setNewCat(null);
  };

  const accounts = ['Main', ...(settings.accounts ?? []).map(a => a.name).filter(n => n !== 'Main')];

  const another = () => { setSaved(null); setTimeout(() => amtRef.current?.focus(), 30); };

  // Hardware keyboard: digits, dot, + − =, backspace, Enter. Text fields keep their own typing.
  const savedRef = useRef(saved);
  savedRef.current = saved;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const pad = tag === 'INPUT' && !!t?.dataset.pad;
      const typing = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !pad) || !!t?.isContentEditable;
      if (e.key === 'Enter') {
        if (savedRef.current) return;
        // Enter in the note just closes the keyboard; it doesn't save.
        if (t?.id === 'qe-note') { e.preventDefault(); t.blur(); return; }
        // Save only from the amount or the sheet itself — never from Paste SMS, the date, a button or a link.
        if (!pad && (typing || tag === 'INPUT' || tag === 'BUTTON' || tag === 'A')) return;
        e.preventDefault();
        void saveRef.current();
        return;
      }
      if (typing) return;
      let k: string | null = null;
      if (/^[0-9]$/.test(e.key)) k = e.key;
      else if (e.key === '.' || e.key === ',' || e.key === 'Decimal') k = '.';
      else if (e.key === '+' || e.code === 'NumpadAdd') k = '+';
      else if (e.key === '-' || e.code === 'NumpadSubtract') k = '-';
      else if (e.key === '=') k = '=';
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
      catAuto.current = false;
      setCat(c => (c === k ? null : k));
    },
  });

  const reduce = prefersReducedMotion();

  return (
    <Sheet open={open} onClose={onClose} title="Add transaction" hideTitle>
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
          <div className="home-switch qe-kind" role="tablist" aria-label="Type">
            {(['income', 'expense'] as const).map(k => (
              <button key={k} type="button" role="tab" aria-selected={entry === k} onClick={() => { setEntry(k); setErr(''); }}>{k === 'income' ? 'Income' : 'Expense'}</button>
            ))}
          </div>
          {!isIncome && (
            <form className="qe-type" onSubmit={e => { e.preventDefault(); void useTyped(); }}>
              <label htmlFor="qe-typed" className="sr-only">Type it</label>
              <input id="qe-typed" className="input" value={typed} autoComplete="off" enterKeyHint="go" placeholder="Type it: bijli 2400 15th" onChange={e => setTyped(e.target.value)} />
              {draft && <button type="submit" className="btn primary">{draft.type === 'expense' || draft.type === 'note' ? 'Fill' : 'Add'}</button>}
              {draft && draft.type !== 'expense' && draft.type !== 'note' && <small aria-live="polite">{draft.summary}</small>}
            </form>
          )}
          <div className="qe-head">
            <div className="money-qe-display">
              <label htmlFor="qe-amt" className="sr-only">Amount</label>
              <div className={`money-qe-amt${isSum ? ' is-sum' : ''}`}>
                <span aria-hidden="true">₹</span>
                <input
                  ref={amtRef} id="qe-amt" data-pad="1" className="num" readOnly inputMode="none" placeholder="0" autoComplete="off"
                  value={amt ? padDisplay(amt) : ''} aria-invalid={!!err || sumBad} aria-describedby={err ? 'qe-err' : 'qe-hint'}
                />
              </div>
            </div>
            {!isIncome && <CaptureBar cards={cards ?? []} onFill={fill} onError={msg => setErr(msg)} />}
          </div>
          {/* One short line under the amount: an error, the running sum, or the category budget. */}
          {err ? <span className="money-qe-err qe-line" id="qe-err" role="alert">{err}</span>
            : isSum ? <span className={`money-qe-total qe-line num${sumBad ? ' bad' : ''}`} aria-live="polite">{sumBad ? "Total can't be zero or less" : `= ${inr(value)}`}</span>
              : budgetHint ? <span className={`money-qe-bhint qe-line money-lvl-text-${budgetHint.level}`} aria-live="polite">{budgetHint.text}</span>
                : null}
          <span className="sr-only" id="qe-hint">Use the number pad below or your keyboard. Plus and minus add up several amounts. Hold a category to pin it.</span>

          {!isIncome && (
            <>
              <p className="qe-label">Category{cat ? <b> · {cat}</b> : null}</p>
              <div className="chips money-qe-chips qe-rounds" role="group" aria-label="Category (hold to pin)">
                {order.map(k => {
                  const Icon = catIcon(k);
                  const own = (settings.customCategories ?? []).includes(k);
                  const isFav = favs.includes(k);
                  return (
                    <button key={k} type="button" className="money-qe-cat qe-round" data-cat={k} aria-pressed={cat === k} title={k}
                      aria-label={isFav ? `${k}, pinned` : k} {...catProps(k)}>
                      {own ? <span aria-hidden="true">{k.slice(0, 2)}</span> : <Icon size={20} aria-hidden="true" />}
                      {isFav && <Star size={11} className="money-qe-star" aria-hidden="true" fill="currentColor" />}
                    </button>
                  );
                })}
                <button type="button" className="qe-round is-add" aria-label="New category" onClick={() => setNewCat(v => (v === null ? '' : null))}><Plus size={20} aria-hidden="true" /></button>
              </div>
              {newCat !== null && (
                <form className="qe-type" onSubmit={e => { e.preventDefault(); void addCategory(); }}>
                  <label htmlFor="qe-newcat" className="sr-only">New category name</label>
                  <input id="qe-newcat" className="input" autoFocus maxLength={24} value={newCat} placeholder="New category name" onChange={e => setNewCat(e.target.value)} />
                  <button type="submit" className="btn primary">Add</button>
                </form>
              )}
            </>
          )}

          <div className="qe-opts">
            <label className="qe-sel">
              <span className="sr-only">Account</span>
              <select value={account} onChange={e => setAccount(e.target.value)}>
                {accounts.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </label>
            {!isIncome && <label className="qe-sel">
              <span className="sr-only">Paid with</span>
              <select value={mode} onChange={e => setMode(e.target.value)}>
                {modes.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </label>}
            <label className="qe-sel">
              <span className="sr-only">When</span>
              <select value={day} onChange={e => {
                const v = e.target.value as Day;
                setDay(v);
                if (v === 'pick') setTimeout(() => document.getElementById('qe-date')?.focus(), 30);
              }}>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="pick">Other day…</option>
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </label>
            {day === 'pick' && (
              <>
                <label htmlFor="qe-date" className="sr-only">Date</label>
                <input id="qe-date" type="date" className="input num money-qe-date" value={picked} max={todayISO()} onChange={e => setPicked(e.target.value)} />
              </>
            )}
            {!isIncome && <button type="button" className="chip qe-split" aria-pressed={splitOn} onClick={() => { setSplitOn(v => !v); setSplitErr(''); }}>
              <Users size={16} aria-hidden="true" /> Split
            </button>}
          </div>
          {!isIncome && splitOn && (
            <SplitPicker amount={value} draft={splitDraft} known={splitNames} saved={settings.splitPeople} error={splitErr}
              onChange={dft => { setSplitDraft(dft); setSplitErr(''); }} />
          )}

          <div className="field money-qe-note qe-noterow">
            <label htmlFor="qe-note" className="sr-only">Note (optional)</label>
            <input id="qe-note" className="input" value={note} placeholder={isIncome ? 'From where? (optional)' : 'Note (optional)'} autoComplete="off" enterKeyHint="done"
              onChange={e => (isIncome ? setNote(e.target.value) : onNote(e.target.value))}
              onFocus={e => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }), 250); }} />
            {!isIncome && <>
              <label htmlFor="qe-time" className="sr-only">Time</label>
              <input id="qe-time" type="time" className="input num qe-time" value={time} onChange={e => setTime(e.target.value)} />
            </>}
          </div>

          <div className="money-qe-pad" role="group" aria-label="Number pad">
            {PAD.map(k => (
              <button key={k} type="button" className={`money-qe-key num${/^[+\-=]$|^back$/.test(k) ? ' op' : ''}`}
                onClick={() => press(k)} disabled={k === 'back' && !amt} aria-label={KEY_LABEL[k] ?? k}>
                {k === 'back' ? <Delete size={22} aria-hidden="true" /> : k === '-' ? '−' : k}
              </button>
            ))}
          </div>

          {/* Always visible at the bottom of the sheet, however small the phone. */}
          <div className="sheet-actions">
            <button type="button" className="btn primary block money-qe-save" onClick={() => void save()} aria-disabled={value <= 0 || sumBad}>
              <Check size={20} aria-hidden="true" /> Save{value > 0 ? ` ${inr(value)}` : ''}{isIncome ? ' income' : cat ? ` · ${cat}` : ''}
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
