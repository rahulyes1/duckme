/** Home tab: what you've spent, then today's priorities, then pinned and recent notes. */
import { ArrowRight, Plus } from 'lucide-react';
import { useMemo } from 'react';
import type { Card, Settings } from '../../lib/types';
import { fmtMonth, inr, today, todayISO } from '../../lib/format';
import { useCountUp } from '../../lib/hooks';
import { isSpend, monthSpend } from '../../lib/logic';
import { NotesBento } from './NotesBento';
import { TodayPriorities } from './TodayPriorities';
import { todayPriorities } from './priorities';
import { homeNotes } from './home-notes';

interface Props {
  cards: Card[]; settings: Settings; isHidden: (c: Card) => boolean; newId: string | null;
  onSwiped: () => void; onTracker: () => void; onNotes: () => void; onWrite: () => void;
}

export function Dashboard({ cards, settings, isHidden, newId, onSwiped, onTracker, onNotes, onWrite }: Props) {
  const iso = todayISO();
  const spent = useMemo(() => monthSpend(cards, today()).total, [cards, iso]); // eslint-disable-line react-hooks/exhaustive-deps
  const spentToday = useMemo(() => cards.reduce((s, c) => s + (isSpend(c) && c.date === iso ? c.amount ?? 0 : 0), 0), [cards, iso]);
  const prio = useMemo(() => todayPriorities(cards, today()), [cards, iso]); // eslint-disable-line react-hooks/exhaustive-deps
  const { pinned, recent } = useMemo(() => homeNotes(cards), [cards]);
  const shown = useCountUp(spent, 600);
  const month = fmtMonth(today()).split(' ')[0];

  return (
    <>
      <button type="button" className="spend" onClick={onTracker} aria-label={`Spent in ${month}: ${inr(spent)}. Today ${inr(spentToday)}. Open Tracker`}>
        <span className="spend-k">Spent in {month}</span>
        <b className="spend-big num">{inr(shown)}</b>
        <span className="spend-rule" aria-hidden="true"><i /></span>
        <span className="spend-two num">
          <span><small>Today</small>{inr(spentToday)}</span>
          <span><small>Daily average</small>{inr(spent / today().getDate())}</span>
        </span>
      </button>

      <TodayPriorities items={prio.items} more={prio.more} />

      {pinned.length > 0 && (
        <section className="rn" aria-labelledby="rn-pin">
          <div className="rn-head"><h2 id="rn-pin">Pinned</h2></div>
          <NotesBento cards={pinned} settings={settings} isHidden={isHidden} newId={newId} onSwiped={onSwiped} />
        </section>
      )}

      <section className="rn" aria-labelledby="rn-recent">
        <div className="rn-head">
          <h2 id="rn-recent">Recent notes</h2>
          <button type="button" className="rn-all" onClick={onNotes}>All notes <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
        {recent.length
          ? <NotesBento cards={recent} settings={settings} isHidden={isHidden} newId={newId} onSwiped={onSwiped} />
          : <button type="button" className="btn block" onClick={onWrite}><Plus size={18} aria-hidden="true" />Write a note</button>}
        {!pinned.length && recent.length > 0 && <p className="rn-tip">Hold a note to pin it here.</p>}
      </section>
    </>
  );
}
