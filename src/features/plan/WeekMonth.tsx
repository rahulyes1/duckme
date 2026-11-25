import { useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, Check, Plus } from 'lucide-react';
import type { Card } from '../../lib/types';
import { KIND_LABEL, isActive } from '../../lib/types';
import { useApp } from '../../app-context';
import { createCard, markDone, updateCard } from '../../lib/actions';
import { byRank } from '../../lib/logic';
import { buzz, inr, today } from '../../lib/format';
import { DuePill, TYPE_ICON } from '../../ui/CardTile';
import { WhenPicker, whenLabel } from '../../ui/WhenPicker';
import { SLOTS, slotOf, whenForSlot, type Slot } from './when';

const titleOf = (c: Card) => c.title || c.body?.split(/\n/)[0]?.slice(0, 60) || c.checklist?.[0]?.text || 'Untitled';

const SLOT_HINT: Record<Slot, string> = {
  week: 'What must get done by Sunday',
  month: 'Bigger things for this month',
  next: 'Lined up for next week',
  later: 'Further out',
};

function PRow({ card: c, onPick }: { card: Card; onPick: (id: string) => void }) {
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
    <li className={`plan-prow ${leaving ? 'is-leaving' : ''}`} data-color={c.color}>
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
          {c.due && <DuePill due={c.due} />}
          {!!c.amount && <span className="pill outline num">{inr(c.amount)}</span>}
        </span>
      </button>
      <button type="button" className="icon-btn" aria-label={`Change when to do ${title}`} onClick={() => onPick(c.id)}>
        <CalendarDays size={18} aria-hidden="true" />
      </button>
    </li>
  );
}

function AddLine({ slot, title }: { slot: Slot; title: string }) {
  const app = useApp();
  const [text, setText] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      await createCard({ type: 'task', title: t, when: whenForSlot(slot, today()) });
      buzz(6);
    } catch {
      setText(t);
      app.toast('Could not add that.');
    }
  };
  const id = `plan-add-${slot}`;
  return (
    <form className="plan-padd" onSubmit={submit}>
      <label htmlFor={id} className="sr-only">Add a priority to {title}</label>
      <Plus size={18} aria-hidden="true" className="plan-padd-icon" />
      <input id={id} className="plan-padd-input" value={text} onChange={e => setText(e.target.value)}
        placeholder="Add a priority" enterKeyHint="done" autoComplete="off" />
    </form>
  );
}

export function WeekMonth({ cards }: { cards: Card[] }) {
  const [picking, setPicking] = useState<string | null>(null);
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

  const pickCard = picking ? cards.find(c => c.id === picking) : undefined;

  return (
    <section aria-label="Week and month priorities" className="plan-wm">
      <p className="plan-lead">Pick a few things for this week and this month. Type a line and press Enter to add one.</p>
      {SLOTS.map(s => {
        const list = groups[s.id];
        return (
          <section key={s.id} className="plan-wsec" data-slot={s.id} aria-labelledby={`plan-wsec-${s.id}`}>
            <header className="plan-wsec-h">
              <h2 id={`plan-wsec-${s.id}`}>{s.title} <span className="plan-count num" aria-label={`${list.length} items`}>{list.length}</span></h2>
              <p>{SLOT_HINT[s.id]}</p>
            </header>
            {list.length > 0 && (
              <ul className="plan-plist">
                {list.map(c => <PRow key={c.id} card={c} onPick={setPicking} />)}
              </ul>
            )}
            <AddLine slot={s.id} title={s.title} />
          </section>
        );
      })}
      <WhenPicker
        open={!!pickCard}
        value={pickCard?.when}
        onChange={w => { if (picking) void updateCard(picking, { when: w }); }}
        onClose={() => setPicking(null)}
      />
    </section>
  );
}
