import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarClock, CalendarDays, Check, ChevronDown, X } from 'lucide-react';
import type { Card, When } from '../../lib/types';
import { KIND_LABEL, isActive } from '../../lib/types';
import { useApp } from '../../app-context';
import { markDone, updateCard, withUndo } from '../../lib/actions';
import { byRank } from '../../lib/logic';
import { addDays, buzz, daysLeft, dueTone, fmtDate, fromISO, inr, toISO, today } from '../../lib/format';
import { DuePill, TYPE_ICON } from '../../ui/CardTile';
import { WhenPicker, whenLabel } from '../../ui/WhenPicker';
import { DOW_SHORT, SLOTS, slotOf, weekStart, type Slot } from './when';
import { SmartAdd } from './SmartAdd';
import { timeLabel } from './smart';

const titleOf = (c: Card) => c.title || c.body?.split(/\n/)[0]?.slice(0, 60) || c.checklist?.[0]?.text || 'Untitled';

const SLOT_HINT: Record<Slot, string> = {
  week: 'What must get done by Sunday?',
  month: 'Bigger things for this month.',
  next: 'Lined up for next week',
  later: 'Further out',
};

/** The 7 days (Mon → Sun) of the week that starts `offsetWeeks` from this one. */
function weekDays(offsetWeeks: number, ref: Date): Date[] {
  const m = addDays(weekStart(ref), offsetWeeks * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(m, i));
}

/** Group key for a card inside a section: a specific day ISO, or 'any'. */
const dayKey = (c: Card): string => (c.when?.unit === 'day' ? c.when.start : 'any');

function DayChips({ card: c, days }: { card: Card; days: Date[] }) {
  const t = toISO(today());
  const sel = c.when?.unit === 'day' ? c.when.start : null;
  const weekOf: When = { unit: 'week', start: toISO(days[0]) };
  return (
    <div className="plan-days" role="group" aria-label={`Which day for ${titleOf(c)}`}>
      {days.map(d => {
        const iso = toISO(d);
        const on = sel === iso;
        return (
          <button key={iso} type="button" className="plan-day" aria-pressed={on} data-past={iso < t || undefined}
            aria-label={`${DOW_SHORT[d.getDay()]} ${fmtDate(iso)}${iso === t ? ', today' : ''}`}
            onClick={() => { buzz(6); void updateCard(c.id, { when: on ? weekOf : { unit: 'day', start: iso } }); }}>
            <span>{DOW_SHORT[d.getDay()].slice(0, 3)}</span>
            <b className="num">{d.getDate()}</b>
          </button>
        );
      })}
    </div>
  );
}

/** This month's dates as a Mon-first grid; tap a date to plan it for that day. */
function MonthGrid({ card: c }: { card: Card }) {
  const ref = today();
  const t = toISO(ref);
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const count = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // blanks before the 1st (Mon-first)
  const sel = c.when?.unit === 'day' ? c.when.start : null;
  const monthOf: When = { unit: 'month', start: toISO(first) };
  return (
    <div className="plan-mgrid" role="group" aria-label={`Which date for ${titleOf(c)}`}>
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="plan-mgrid-h" aria-hidden="true">{d}</span>)}
      {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} aria-hidden="true" />)}
      {Array.from({ length: count }, (_, i) => {
        const d = new Date(ref.getFullYear(), ref.getMonth(), i + 1);
        const iso = toISO(d);
        const on = sel === iso;
        return (
          <button key={iso} type="button" className="plan-mday num" aria-pressed={on} data-past={iso < t || undefined} data-today={iso === t || undefined}
            aria-label={`${DOW_SHORT[d.getDay()]} ${fmtDate(iso)}${iso === t ? ', today' : ''}`}
            onClick={() => { buzz(6); void updateCard(c.id, { when: on ? monthOf : { unit: 'day', start: iso } }); }}>
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}

/** One-tap deadlines: today, tomorrow, this Sunday, last day of the month. */
function DeadlineChips({ card: c }: { card: Card }) {
  const ref = today();
  const opts: [string, string][] = [
    ['Today', toISO(ref)],
    ['Tomorrow', toISO(addDays(ref, 1))],
    ['This Sunday', toISO(addDays(weekStart(ref), 6))],
    ['Month end', toISO(new Date(ref.getFullYear(), ref.getMonth() + 1, 0))],
  ];
  return (
    <div className="plan-dchips" role="group" aria-label={`Quick deadline for ${titleOf(c)}`}>
      {opts.map(([label, iso]) => (
        <button key={label} type="button" className="chip" aria-pressed={c.due === iso}
          onClick={() => { buzz(6); void updateCard(c.id, { due: c.due === iso ? undefined : iso }); }}>
          {label}
        </button>
      ))}
    </div>
  );
}

function PlanPanel({ card: c, slot, onPick }: { card: Card; slot: Slot; onPick: (id: string, unit: When['unit']) => void }) {
  const ref = today();
  const dueId = `due-${c.id}`;
  return (
    <div className="plan-ppanel">
      {(slot === 'week' || slot === 'next') ? (
        <>
          <span className="plan-plabel">Which day?</span>
          <DayChips card={c} days={weekDays(slot === 'week' ? 0 : 1, ref)} />
        </>
      ) : slot === 'month' ? (
        <>
          <span className="plan-plabel">Which day this month?</span>
          <MonthGrid card={c} />
        </>
      ) : (
        <div className="plan-prowline">
          <span className="plan-plabel">Which day?</span>
          <button type="button" className="btn" onClick={() => onPick(c.id, 'day')}>
            <CalendarDays size={18} aria-hidden="true" />
            {c.when?.unit === 'day' ? whenLabel(c.when) : 'Pick a date'}
          </button>
        </div>
      )}
      <span className="plan-plabel">Deadline</span>
      <DeadlineChips card={c} />
      <div className="plan-prowline">
        <label className="plan-plabel" htmlFor={dueId}>Or a date</label>
        <input id={dueId} type="date" className="input plan-pdue num" value={c.due ?? ''}
          onChange={e => void updateCard(c.id, { due: e.target.value || undefined })} />
        {c.due && (
          <button type="button" className="icon-btn" aria-label={`Clear deadline for ${titleOf(c)}`} onClick={() => void updateCard(c.id, { due: undefined })}>
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <button type="button" className="plan-plink" onClick={() => onPick(c.id, c.when?.unit ?? 'week')}>
        Move to another week or month
      </button>
    </div>
  );
}

/** Ring that empties as the deadline gets closer (full = lots of time, empty = due). */
function DeadlineRing({ card: c }: { card: Card }) {
  if (!c.due) return null;
  const left = daysLeft(c.due);
  const total = Math.max(1, Math.round((fromISO(c.due).getTime() - new Date(c.createdAt).setHours(0, 0, 0, 0)) / 864e5));
  const frac = Math.max(0, Math.min(1, left / total));
  const tone = dueTone(c.due);
  const r = 9, C = 2 * Math.PI * r;
  return (
    <svg className={`plan-ring is-${tone}`} width="24" height="24" viewBox="0 0 24 24" role="img"
      aria-label={left < 0 ? `Deadline missed by ${-left} ${-left === 1 ? 'day' : 'days'}` : left === 0 ? 'Deadline is today' : `Deadline in ${left} ${left === 1 ? 'day' : 'days'}`}>
      <circle className="bg" cx="12" cy="12" r={r} />
      <circle className="fg" cx="12" cy="12" r={r} strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
    </svg>
  );
}

function PRow({ card: c, slot, open, onToggle, onPick }: {
  card: Card; slot: Slot; open: boolean; onToggle: () => void; onPick: (id: string, unit: When['unit']) => void;
}) {
  const app = useApp();
  const reduce = useReducedMotion();
  const Icon = TYPE_ICON[c.type];
  const title = titleOf(c);
  const [phase, setPhase] = useState<'idle' | 'ticked' | 'leaving'>('idle');
  const overdue = !!c.due && daysLeft(c.due) < 0;

  const done = async () => {
    // Check pop + strike-through first, then slide away.
    setPhase('ticked');
    buzz([8, 40, 14]);
    await new Promise(r => setTimeout(r, reduce ? 0 : 420));
    setPhase('leaving');
    try {
      const undo = await markDone(c.id);
      app.toast(c.type === 'bill' ? `Paid: ${title}` : `Done: ${title}`, undo);
    } catch {
      setPhase('idle');
      app.toast('Could not mark that done.');
    }
  };

  const moveToTomorrow = async () => {
    buzz(8);
    const tm = toISO(addDays(today(), 1));
    const patch: Partial<Card> = { due: tm };
    if (c.when?.unit === 'day' && c.when.start < tm) patch.when = { unit: 'day', start: tm };
    const undo = await withUndo(async () => { await updateCard(c.id, patch); });
    app.toast(`Moved to tomorrow, ${fmtDate(tm)}`, undo);
  };

  return (
    <motion.li layout={!reduce} className={`plan-prow-wrap is-${phase}`} data-color={c.color}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduce ? { duration: 0.01 } : { type: 'spring', stiffness: 460, damping: 26 }}>
      <div className="plan-prow">
        <button type="button" className="plan-pcheck" aria-label={c.type === 'bill' ? `Mark ${title} paid` : `Mark ${title} done`}
          onClick={done} disabled={phase !== 'idle'}>
          <Check size={18} aria-hidden="true" />
        </button>
        <button type="button" className="plan-pmain" onClick={e => app.openCard(c.id, e.currentTarget.closest('li'))}>
          <span className="plan-brow-t">
            <Icon size={15} aria-hidden="true" className="plan-brow-icon" />
            <span className="sr-only">{KIND_LABEL[c.type]}: </span>
            <span className="plan-brow-title">{title}</span>
          </span>
          <span className="pills plan-brow-pills">
            {c.when && <span className="pill accent">{whenLabel(c.when)}</span>}
            {c.reminder && <span className="pill outline">{timeLabel(c.reminder.slice(11, 16))}</span>}
            {c.due ? <DuePill due={c.due} /> : null}
            {!!c.amount && <span className="pill outline num">{inr(c.amount)}</span>}
          </span>
        </button>
        <DeadlineRing card={c} />
        <button type="button" className={`plan-pplan ${open ? 'is-open' : ''}`} aria-expanded={open}
          aria-label={`Plan day and deadline for ${title}`} onClick={onToggle}>
          <CalendarClock size={18} aria-hidden="true" />
          <span>Plan</span>
          <ChevronDown size={14} aria-hidden="true" className="plan-pchev" />
        </button>
      </div>
      {overdue && phase === 'idle' && (
        <div className="plan-overdue">
          <span>Missed the deadline.</span>
          <button type="button" className="btn plan-overdue-btn" onClick={() => void moveToTomorrow()}>Move to tomorrow</button>
        </div>
      )}
      {open && <PlanPanel card={c} slot={slot} onPick={onPick} />}
    </motion.li>
  );
}

/** Day groups inside a section: "Anytime …" first, then each planned day in date order. */
function groupByDay(list: Card[], slot: Slot): { key: string; label: string; items: Card[] }[] {
  const m = new Map<string, Card[]>();
  for (const c of list) {
    const k = dayKey(c);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(c);
  }
  const anyLabel = slot === 'week' ? 'Anytime this week' : slot === 'month' ? 'Anytime this month' : slot === 'next' ? 'Anytime next week' : 'No date yet';
  const t = toISO(today());
  const tm = toISO(addDays(today(), 1));
  return [...m.keys()]
    .sort((a, b) => (a === 'any' ? -1 : b === 'any' ? 1 : a < b ? -1 : 1))
    .map(k => {
      let label = anyLabel;
      if (k !== 'any') {
        const d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
        const day = DOW_SHORT[d.getDay()];
        label = k === t ? `Today · ${day} ${fmtDate(k)}` : k === tm ? `Tomorrow · ${day} ${fmtDate(k)}` : `${day} ${fmtDate(k)}`;
        if (k < t) label += ' · past';
      }
      return { key: k, label, items: m.get(k)! };
    });
}

export function WeekMonth({ cards }: { cards: Card[] }) {
  const [picking, setPicking] = useState<{ id: string; unit: When['unit'] } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const ref = today();
  const refKey = ref.getTime();

  const groups = useMemo(() => {
    const g: Record<Slot, Card[]> = { week: [], month: [], next: [], later: [] };
    for (const c of [...cards].sort(byRank)) {
      if (!isActive(c) || !c.when) continue;
      g[slotOf(c.when, ref)].push(c);
    }
    return g;
  }, [cards, refKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [ahead, setAhead] = useState(false);
  const pickCard = picking ? cards.find(c => c.id === picking.id) : undefined;
  const onPick = (id: string, unit: When['unit']) => setPicking({ id, unit });

  return (
    <section aria-label="Priorities for this week and this month" className="plan-wm">
      {Object.values(groups).some(l => l.some(c => !!c.due)) && (
        <p className="plan-legend">Ring = time left to the deadline. It empties as the date nears: orange is soon, red is late.</p>
      )}
      {SLOTS.map(s => {
        const list = groups[s.id];
        if ((s.id === 'next' || s.id === 'later') && !list.length && !ahead) return null;
        const days = groupByDay(list, s.id);
        return (
          <section key={s.id} className="plan-wsec" data-slot={s.id} aria-labelledby={`plan-wsec-${s.id}`}>
            <header className="plan-wsec-h">
              <h2 id={`plan-wsec-${s.id}`}>{s.title} <span className="plan-count num" aria-label={`${list.length} items`}>{list.length}</span></h2>
              {!list.length && <p>{SLOT_HINT[s.id]}</p>}
            </header>
            {days.map(g => (
              <div key={g.key} className="plan-dgroup">
                {(days.length > 1 || g.key !== 'any') && <h3 className="plan-dlabel">{g.label}</h3>}
                <ul className="plan-plist">
                  {g.items.map(c => (
                    <PRow key={c.id} card={c} slot={s.id} open={openId === c.id}
                      onToggle={() => setOpenId(o => (o === c.id ? null : c.id))} onPick={onPick} />
                  ))}
                </ul>
              </div>
            ))}
            <SmartAdd slot={s.id} title={s.title} onAdded={(id, planned) => { if (!planned) setOpenId(id); }} />
          </section>
        );
      })}
      {!ahead && !groups.next.length && !groups.later.length && (
        <button type="button" className="btn ghost plan-ahead" onClick={() => setAhead(true)}>Plan further ahead</button>
      )}
      <WhenPicker
        open={!!pickCard}
        value={pickCard?.when}
        initialUnit={picking?.unit}
        onChange={w => { if (picking) void updateCard(picking.id, { when: w }); }}
        onClose={() => setPicking(null)}
      />
    </section>
  );
}
