/**
 * Smart "Add a priority" line: as you type it suggests days ("on"), times ("at") and deadlines
 * ("by"), reads "kal / friday / 15th / 6pm" straight from your words, turns picks into pills,
 * and warns about real-life clashes (Sunday deadlines, bank holidays, planned after the deadline).
 * All rules live in ./smart.ts — no AI, works offline.
 */
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { AlarmClock, CalendarCheck, CalendarDays, Flag, Lightbulb, Plus, Sparkles, X } from 'lucide-react';
import { useApp } from '../../app-context';
import { createCard } from '../../lib/actions';
import { useSettings } from '../../lib/hooks';
import { addDays, buzz, toISO, today } from '../../lib/format';
import {
  chipsFor, cleanTitle, detect, learn, loadHabits, reminderFrom, shortDay, timeLabel, triggerOf, warningsFor, whenFrom,
  type Chip, type ChipKind, type SmartState,
} from './smart';
import { whenForSlot, type Slot } from './when';

const ICON: Record<ChipKind, typeof CalendarDays> = { day: CalendarDays, time: AlarmClock, due: Flag };

function pillLabel(kind: ChipKind, v: string): string {
  if (kind === 'time') return timeLabel(v);
  const t = toISO(today());
  const tm = toISO(addDays(today(), 1));
  const d = v === t ? 'Today' : v === tm ? 'Tomorrow' : shortDay(v);
  return kind === 'due' ? `Due ${d}` : d;
}

export function SmartAdd({ slot, title, onAdded }: { slot: Slot; title: string; onAdded: (id: string, planned: boolean) => void }) {
  const app = useApp();
  const settings = useSettings();
  const reduce = useReducedMotion();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<SmartState>({});
  const [ignored, setIgnored] = useState<ChipKind[]>([]);
  const [focused, setFocused] = useState(false);
  const [habits, setHabits] = useState(loadHabits);
  const inputRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const pickFor = useRef<'day' | 'due'>('day');
  const ref = today();
  const refKey = ref.getTime();

  const detected = useMemo(() => detect(text, ref).filter(d => !ignored.includes(d.kind)), [text, ignored, refKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const state: SmartState = useMemo(() => {
    const s: SmartState = {};
    for (const d of detected) s[d.kind] = d.value;
    return { ...s, ...picked };
  }, [detected, picked]);
  const chips = useMemo(() => chipsFor(text, ref, settings.salaryDay, habits, state), [text, settings.salaryDay, habits, state, refKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const warnings = useMemo(() => warningsFor(state, ref), [state, refKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const trig = triggerOf(text);

  const reset = () => { setText(''); setPicked({}); setIgnored([]); };

  const stripTrigger = (t: string) => t.replace(/\s+(on|at|by|before|till|until|due)\s*$/i, ' ').replace(/\s{2,}/g, ' ');

  const apply = (c: Chip) => {
    buzz(8);
    if (c.value === null) {
      pickFor.current = c.kind === 'due' ? 'due' : 'day';
      const el = dateRef.current;
      if (el) {
        el.value = '';
        try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { el.focus(); }
      }
      return;
    }
    setPicked(p => ({ ...p, [c.kind]: c.value! }));
    setIgnored(i => i.filter(k => k !== c.kind));
    if (triggerOf(text)) setText(t => stripTrigger(t));
    if (c.kind === 'time') learn('times', c.value);
    if (c.kind === 'due') learn('dues', c.id);
    setHabits(loadHabits());
    inputRef.current?.focus();
  };

  const removePill = (kind: ChipKind) => {
    buzz(4);
    if (picked[kind]) setPicked(p => { const n = { ...p }; delete n[kind]; return n; });
    else setIgnored(i => [...i, kind]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = cleanTitle(text, detected);
    if (!name) { inputRef.current?.focus(); return; }
    const snapshot = { ...state };
    reset();
    try {
      const c = await createCard({
        type: 'task', title: name,
        when: whenFrom(snapshot, whenForSlot(slot, ref)),
        due: snapshot.due,
        reminder: reminderFrom(snapshot, ref),
      });
      buzz([10, 30, 10]);
      const bits = [snapshot.day && pillLabel('day', snapshot.day), snapshot.time && timeLabel(snapshot.time), snapshot.due && pillLabel('due', snapshot.due)].filter(Boolean);
      app.toast(bits.length ? `Added: ${name} · ${bits.join(' · ')}` : `Added to ${title}`);
      onAdded(c.id, !!(snapshot.day || snapshot.due));
    } catch {
      setText(name);
      app.toast('Could not add that.');
    }
  };

  const id = `plan-add-${slot}`;
  const kinds: ChipKind[] = ['day', 'time', 'due'];
  const showHint = focused && !text;
  const spring = reduce ? { duration: 0.01 } : { type: 'spring' as const, stiffness: 520, damping: 32 };

  return (
    <LayoutGroup id={`smart-${slot}`}>
      <form className={`plan-smart ${focused ? 'is-focused' : ''}`} onSubmit={submit}
        onClick={e => { const t = e.target as HTMLElement; if (!t.closest('button') && t.tagName !== 'INPUT') inputRef.current?.focus(); }}>
        <div className="plan-padd">
          <label htmlFor={id} className="sr-only">Add a priority to {title}</label>
          <Plus size={18} aria-hidden="true" className="plan-padd-icon" />
          <input ref={inputRef} id={id} className="plan-padd-input" value={text} onChange={e => setText(e.target.value)}
            onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Add a priority" enterKeyHint="done" autoComplete="off" autoCapitalize="sentences"
            aria-describedby={`${id}-hint`} />
          <button type="submit" className="btn primary plan-padd-btn" disabled={!cleanTitle(text, detected)}>Add</button>
        </div>

        {/* Picked / recognised values as pills */}
        <div className="plan-pills" aria-live="polite">
          <AnimatePresence initial={false}>
            {kinds.filter(k => state[k]).map(k => {
              const Icon = ICON[k];
              return (
                <motion.span key={k} layout layoutId={`smart-${slot}-${k}-${state[k]}`} className={`plan-pill is-${k}`}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.12 } }} transition={spring}>
                  <Icon size={14} aria-hidden="true" />
                  {pillLabel(k, state[k]!)}
                  <button type="button" aria-label={`Remove ${k === 'due' ? 'deadline' : k}`} onClick={() => removePill(k)}><X size={13} aria-hidden="true" /></button>
                </motion.span>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Suggestions */}
        <AnimatePresence mode="popLayout">
          {chips.length > 0 && (
            <motion.div key={trig ?? 'nudge'} className="plan-chips" role="group"
              aria-label={trig === 'on' ? 'Which day' : trig === 'at' ? 'What time' : trig === 'by' ? 'Deadline' : 'Suggestions'}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
              <span className="plan-chips-k">
                {trig ? <Sparkles size={14} aria-hidden="true" /> : <Lightbulb size={14} aria-hidden="true" />}
                {trig === 'on' ? 'Which day?' : trig === 'at' ? 'What time?' : trig === 'by' ? 'Deadline?' : 'Needs a deadline?'}
              </span>
              {chips.map((c, i) => (
                <motion.button key={c.id} type="button" className={`plan-schip ${c.suggested ? 'is-suggested' : ''}`}
                  layoutId={c.value ? `smart-${slot}-${c.kind}-${c.value}` : undefined}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: reduce ? { duration: 0.01 } : { ...spring, delay: i * 0.035 } }}
                  exit={{ opacity: 0, y: 6, transition: { duration: 0.1 } }}
                  onMouseDown={e => e.preventDefault()} onClick={() => apply(c)}>
                  <b>{c.label}</b>{c.sub && <span>{c.sub}</span>}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Real-life checks */}
        <AnimatePresence>
          {warnings.map(w => (
            <motion.p key={w.id} className="plan-warn" role="status"
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
              <CalendarCheck size={15} aria-hidden="true" />
              <span>{w.text}</span>
              {w.fix && (
                <button type="button" className="plan-warn-fix" onMouseDown={e => e.preventDefault()}
                  onClick={() => { buzz(8); setPicked(p => ({ ...p, ...w.fix!.patch })); }}>{w.fix.label}</button>
              )}
            </motion.p>
          ))}
        </AnimatePresence>

        <p id={`${id}-hint`} className={`plan-shint ${showHint ? 'is-on' : ''}`}>
          Try <b>on</b>, <b>at</b> or <b>by</b> — or just write <b>kal</b>, <b>friday</b>, <b>15th</b>, <b>6pm</b>.
        </p>
        <input ref={dateRef} type="date" className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={e => {
            const v = e.target.value;
            if (!v) return;
            setPicked(p => ({ ...p, [pickFor.current]: v }));
            if (triggerOf(text)) setText(t => stripTrigger(t));
            inputRef.current?.focus();
          }} />
      </form>
    </LayoutGroup>
  );
}
