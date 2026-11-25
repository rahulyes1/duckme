import { useState } from 'react';
import { CalendarRange, X } from 'lucide-react';
import type { Card, Quadrant, When } from '../../lib/types';
import { QUADRANTS } from '../../lib/types';
import { WhenPicker, whenLabel } from '../../ui/WhenPicker';

const SHORT: Record<Quadrant, string> = { do: 'Do now', schedule: 'Plan it', quick: 'Quick wins', later: 'Later' };

/** "Plan it" (day / week / month slot) and the 4-box priority, for notes and tasks. */
export function PlanRow({ card, save }: { card: Card; save: (p: Partial<Card>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const setWhen = (w: When | undefined) => { void save({ when: w }); };
  const qId = `q-${card.id}`;
  return (
    <section className="notes-plan" aria-label="Planning">
      <div className="notes-plan-when">
        <button type="button" className={`notes-plan-btn ${card.when ? 'is-set' : ''}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <CalendarRange size={18} aria-hidden="true" />
          {card.when ? <span><span className="sr-only">Planned for </span>{whenLabel(card.when)}</span> : 'Plan it'}
        </button>
        {card.when && (
          <button type="button" className="icon-btn notes-plan-x" aria-label="Clear plan" onClick={() => setWhen(undefined)}>
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="notes-quad" role="radiogroup" aria-labelledby={qId}>
        <span id={qId} className="notes-quad-l">Priority</span>
        {QUADRANTS.map(q => (
          <button
            key={q.id}
            type="button"
            role="radio"
            aria-checked={card.quadrant === q.id}
            className="notes-quad-btn"
            data-q={q.id}
            title={q.hint}
            onClick={() => save({ quadrant: card.quadrant === q.id ? undefined : q.id })}
          >
            <span className="notes-quad-dot" aria-hidden="true" />
            {SHORT[q.id]}
            <span className="sr-only">, {q.hint}</span>
          </button>
        ))}
      </div>
      <WhenPicker open={open} value={card.when} onChange={w => { setWhen(w); }} onClose={() => setOpen(false)} />
    </section>
  );
}
