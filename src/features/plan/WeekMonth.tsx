import { useMemo, useRef, useState, type FormEvent } from 'react';
import { CalendarClock, CalendarDays, Check, ChevronDown, Plus, X } from 'lucide-react';
import type { Card, When } from '../../lib/types';
import { KIND_LABEL, isActive } from '../../lib/types';
import { useApp } from '../../app-context';
import { createCard, markDone, updateCard } from '../../lib/actions';
import { byRank } from '../../lib/logic';
import { addDays, buzz, fmtDate, inr, toISO, today } from '../../lib/format';
import { DuePill, TYPE_ICON } from '../../ui/CardTile';
import { WhenPicker, whenLabel } from '../../ui/WhenPicker';
import { DOW_SHORT, SLOTS, slotOf, weekStart, whenForSlot, type Slot } from './when';

const titleOf = (c: Card) => c.title || c.body?.split(/\n/)[0]?.slice(0, 60) || c.checklist?.[0]?.text || 'Untitled';

const SLOT_HINT: Record<Slot, string> = {
  week: 'What must get done by Sunday. Pick the day you\'ll do each one.',
  month: 'Bigger things for this month. Pick a date if you know it.',
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
      ) : (
        <div className="plan-prowline">
          <span className="plan-plabel">Which day?</span>
          <button type="button" className="btn" onClick={() => onPick(c.id, 'day')}>
            <CalendarDays size={18} aria-hidden="true" />
            {c.when?.unit === 'day' ? whenLabel(c.when) : 'Pick a date'}
          </button>
        </div>
      )}
      <div className="plan-prowline">
        <label className="plan-plabel" htmlFor={dueId}>Deadline</label>
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

function PRow({ card: c, slot, open, onToggle, onPick }: {
  card: Card; slot: Slot; open: boolean; onToggle: () => void; onPick: (id: string, unit: When['unit']) => void;
}) {
  const app = useApp();
  const Icon = TYPE_ICON[c.type];
  const title = titleOf(c);
  const [leaving, setLeaving] = useState(false);

  const done = async () => {
    setLeaving(true);
    buzz(12);
    try {
      const undo = await markDone(c.id);
      app.toast(c.type === 'bill' ? `Paid: ${title}` : `Done: ${title}`, undo);
    } catch {
      setLeaving(false);
      app.toast('Could not mark that done.');
    }
  };

  return (
    <li className={`plan-prow-wrap ${leaving ? 'is-leaving' : ''}`} data-color={c.color}>
      <div className="plan-prow">
        <button type="button" className="plan-pcheck" aria-label={c.type === 'bill' ? `Mark ${title} paid` : `Mark ${title} done`} onClick={done}>
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
            {c.due ? <DuePill due={c.due} /> : null}
            {!!c.amount && <span className="pill outline num">{inr(c.amount)}</span>}
          </span>
        </button>
        <button type="button" className={`plan-pplan ${open ? 'is-open' : ''}`} aria-expanded={open}
          aria-label={`Plan day and deadline for ${title}`} onClick={onToggle}>
          <CalendarClock size={18} aria-hidden="true" />
          <span>Plan</span>
          <ChevronDown size={14} aria-hidden="true" className="plan-pchev" />
        </button>
      </div>
      {open && <PlanPanel card={c} slot={slot} onPick={onPick} />}
    </li>
  );
}

function AddLine({ slot, title }: { slot: Slot; title: string }) {
  const app = useApp();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      await createCard({ type: 'task', title: t, when: whenForSlot(slot, today()) });
      buzz(6);
      app.toast(`Added to ${title}. Tap Plan to pick a day or deadline.`);
    } catch {
      setText(t);
      app.toast('Could not add that.');
    }
  };
  const id = `plan-add-${slot}`;
  return (
    // Tapping anywhere on the line (the + icon, the padding) puts the cursor in the box.
    <form className="plan-padd" onSubmit={submit}
      onClick={e => { const t = e.target as HTMLElement; if (t.tagName !== 'BUTTON' && t.tagName !== 'INPUT') inputRef.current?.focus(); }}>
      <label htmlFor={id} className="sr-only">Add a priority to {title}</label>
      <Plus size={18} aria-hidden="true" className="plan-padd-icon" />
      <input ref={inputRef} id={id} className="plan-padd-input" value={text} onChange={e => setText(e.target.value)}
        placeholder="Add a priority" enterKeyHint="done" autoComplete="off" />
      <button type="submit" className="btn primary plan-padd-btn" disabled={!text.trim()}>Add</button>
    </form>
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

  const pickCard = picking ? cards.find(c => c.id === picking.id) : undefined;
  const onPick = (id: string, unit: When['unit']) => setPicking({ id, unit });

  return (
    <section aria-label="Priorities for this week and this month" className="plan-wm">
      <p className="plan-lead">Add a few things for this week and this month. Tap <b>Plan</b> on any of them to pick the day you'll do it and set a deadline.</p>
      {SLOTS.map(s => {
        const list = groups[s.id];
        const days = groupByDay(list, s.id);
        return (
          <section key={s.id} className="plan-wsec" data-slot={s.id} aria-labelledby={`plan-wsec-${s.id}`}>
            <header className="plan-wsec-h">
              <h2 id={`plan-wsec-${s.id}`}>{s.title} <span className="plan-count num" aria-label={`${list.length} items`}>{list.length}</span></h2>
              <p>{SLOT_HINT[s.id]}</p>
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
            <AddLine slot={s.id} title={s.title} />
          </section>
        );
      })}
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
