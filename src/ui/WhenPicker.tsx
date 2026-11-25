// Plan agent owns this file. Exported names and props are a shared contract — keep them stable.
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { When } from '../lib/types';
import { addDays, fmtDate, fromISO, toISO, today } from '../lib/format';
import { Sheet } from './Sheet';
import {
  MONTH_LONG, calendarCells, monthOptions, normalizeWhen, thisSaturday, weekOptions,
  whenLabel as whenLabelAt,
} from '../features/plan/when';
import '../features/plan/plan.css';

export interface WhenPickerProps {
  open: boolean;
  /** Current value; undefined = not planned. */
  value?: When;
  /** Which tab to open on. Default: value?.unit ?? 'day'. */
  initialUnit?: When['unit'];
  /** Called with the picked slot, or undefined when the user clears it. */
  onChange: (w: When | undefined) => void;
  onClose: () => void;
}

const TABS: { id: When['unit']; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Pop-up with Day / Week / Month tabs: a calendar to pick a date, a list of weeks, a grid of months. */
export function WhenPicker({ open, value, initialUnit, onChange, onClose }: WhenPickerProps): JSX.Element | null {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<When['unit']>(initialUnit ?? value?.unit ?? 'day');
  const [view, setView] = useState<Date>(() => (value ? fromISO(value.start) : today()));

  // Reset each time it opens so it reflects the current value.
  useEffect(() => {
    if (!open) return;
    setTab(initialUnit ?? value?.unit ?? 'day');
    const base = value ? fromISO(value.start) : today();
    setView(new Date(base.getFullYear(), base.getMonth(), 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const now = today();
  const todayISO = toISO(now);
  const sel = value ? normalizeWhen(value) : undefined;
  const pick = (w: When) => { onChange(w); onClose(); };

  const cells = useMemo(() => calendarCells(view), [view]);
  const weeks = useMemo(() => weekOptions(now, 10), [todayISO]); // eslint-disable-line react-hooks/exhaustive-deps
  const months = useMemo(() => monthOptions(now, 12), [todayISO]); // eslint-disable-line react-hooks/exhaustive-deps

  const shiftMonth = (n: number) => setView(v => new Date(v.getFullYear(), v.getMonth() + n, 1));

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.id);
    requestAnimationFrame(() => document.getElementById(`when-tab-${next.id}`)?.focus());
  };

  const quick = [
    { label: 'Today', iso: todayISO },
    { label: 'Tomorrow', iso: toISO(addDays(now, 1)) },
    { label: 'This Saturday', iso: toISO(thisSaturday(now)) },
  ];

  return (
    <Sheet open={open} onClose={onClose} title="When will you do this?">
      <div className="plan-wp">
        <div className="plan-wp-tabs" role="tablist" aria-label="Plan by">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              id={`when-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls="when-panel"
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={e => onTabKey(e, i)}
            >
              {tab === t.id && (
                <motion.span layoutId="plan-wp-pill" className="plan-wp-pill" aria-hidden="true"
                  transition={reduce ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }} />
              )}
              <span className="plan-wp-tlabel">{t.label}</span>
            </button>
          ))}
        </div>

        <div id="when-panel" role="tabpanel" aria-labelledby={`when-tab-${tab}`} className="plan-wp-panel">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0, transition: { duration: reduce ? 0.01 : 0.18, ease: [0.2, 0.8, 0.2, 1] } }}
              exit={{ opacity: 0, transition: { duration: reduce ? 0.01 : 0.12 } }}
            >
              {tab === 'day' && (
                <div>
                  <div className="plan-wp-quick">
                    {quick.map(q => (
                      <button key={q.label} type="button" className="chip plan-wp-chip"
                        aria-pressed={sel?.unit === 'day' && sel.start === q.iso}
                        onClick={() => pick({ unit: 'day', start: q.iso })}>
                        {q.label}
                      </button>
                    ))}
                  </div>
                  <div className="plan-wp-mhead">
                    <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
                      <ChevronLeft size={20} aria-hidden="true" />
                    </button>
                    <b aria-live="polite">{MONTH_LONG[view.getMonth()]} {view.getFullYear()}</b>
                    <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shiftMonth(1)}>
                      <ChevronRight size={20} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="plan-wp-grid" role="group" aria-label={`${MONTH_LONG[view.getMonth()]} ${view.getFullYear()}`}>
                    {DOW.map(d => <span key={d} className="plan-wp-dow" aria-hidden="true">{d}</span>)}
                    {cells.map(d => {
                      const iso = toISO(d);
                      const out = d.getMonth() !== view.getMonth();
                      const past = iso < todayISO;
                      const isSel = sel?.unit === 'day' && sel.start === iso;
                      const cls = ['plan-wp-day', out && 'is-out', past && 'is-past', iso === todayISO && 'is-today', isSel && 'is-sel']
                        .filter(Boolean).join(' ');
                      return (
                        <button key={iso} type="button" className={cls}
                          aria-pressed={isSel}
                          aria-current={iso === todayISO ? 'date' : undefined}
                          aria-label={`${DOW_FULL[d.getDay()]} ${fmtDate(iso)}`}
                          onClick={() => pick({ unit: 'day', start: iso })}>
                          {d.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {tab === 'week' && (
                <ul className="plan-wp-weeks">
                  {weeks.map(w => {
                    const isSel = sel?.unit === 'week' && sel.start === w.start;
                    return (
                      <li key={w.start}>
                        <button type="button" className={`plan-wp-week ${isSel ? 'is-sel' : ''}`} aria-pressed={isSel}
                          onClick={() => pick({ unit: 'week', start: w.start })}>
                          <b>{w.label}</b><span className="num">{w.range}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {tab === 'month' && (
                <div className="plan-wp-months">
                  {months.map(m => {
                    const isSel = sel?.unit === 'month' && sel.start === m.start;
                    return (
                      <button key={m.start} type="button" className={`plan-wp-month ${isSel ? 'is-sel' : ''}`} aria-pressed={isSel}
                        onClick={() => pick({ unit: 'month', start: m.start })}>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="plan-wp-foot">
          {value ? (
            <>
              <span className="plan-wp-cur">Now: <b>{whenLabel(value)}</b></span>
              <button type="button" className="btn ghost" onClick={() => { onChange(undefined); onClose(); }}>
                <X size={16} aria-hidden="true" />Clear
              </button>
            </>
          ) : <span className="plan-wp-cur">Not planned yet</span>}
        </div>
      </div>
    </Sheet>
  );
}

/** "Today", "Wed 26-11" · "This week", "Week of 08-12" · "This month", "January 2027". */
export function whenLabel(w: When): string {
  return whenLabelAt(w, today());
}
