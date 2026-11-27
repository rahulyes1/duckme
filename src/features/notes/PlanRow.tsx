import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarRange, ChevronDown, Flag, ShieldCheck, X } from 'lucide-react';
import type { Card, Quadrant, When } from '../../lib/types';
import { QUADRANTS } from '../../lib/types';
import { WhenPicker, whenLabel } from '../../ui/WhenPicker';
import { fmtDate, prefersReducedMotion, todayISO } from '../../lib/format';

const SHORT: Record<Quadrant, string> = { do: 'Do now', schedule: 'Schedule', quick: 'Quick win', later: 'Later' };

/**
 * One quiet row under a note or task: when you'll do it, and how much it matters.
 * The four priority choices stay folded away until you ask for them.
 */
export function PlanRow({ card, save }: { card: Card; save: (p: Partial<Card>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [qOpen, setQOpen] = useState(false);
  const setWhen = (w: When | undefined) => { void save({ when: w }); };
  const q = card.quadrant;
  const qId = `q-${card.id}`;
  const fast = prefersReducedMotion();

  return (
    <section className="notes-plan" aria-label="Planning">
      <div className="notes-plan-row">
        <span className="notes-plan-when">
          <button type="button" className={`notes-plan-btn ${card.when ? 'is-set' : ''}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
            <CalendarRange size={16} aria-hidden="true" />
            {card.when ? <span><span className="sr-only">Planned for </span>{whenLabel(card.when)}</span> : 'Add a date'}
          </button>
          {card.when && (
            <button type="button" className="icon-btn notes-plan-x" aria-label="Clear date" onClick={() => setWhen(undefined)}>
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </span>
        <button type="button" className={`notes-plan-btn ${q ? 'is-set' : ''}`} data-q={q} aria-expanded={qOpen} aria-controls={qId}
          onClick={() => setQOpen(o => !o)}>
          {q ? <span className="notes-quad-dot" aria-hidden="true" /> : <Flag size={16} aria-hidden="true" />}
          {q ? SHORT[q] : '4-box'}
          <ChevronDown size={14} aria-hidden="true" className={`notes-plan-chev ${qOpen ? 'is-open' : ''}`} />
        </button>
        {card.type === 'note' && (
          <span className="notes-plan-when">
            <label className={`notes-plan-btn notes-plan-exp ${card.expiry ? 'is-set' : ''}`}>
              <ShieldCheck size={16} aria-hidden="true" />
              {card.expiry ? <span>Expires {fmtDate(card.expiry)}</span> : 'Expires'}
              <input type="date" className="notes-plan-date" min={todayISO()} value={card.expiry ?? ''} aria-label="Warranty or document expiry date"
                onChange={e => { void save({ expiry: e.target.value || undefined }); }} />
            </label>
            {card.expiry && (
              <button type="button" className="icon-btn notes-plan-x" aria-label="Clear expiry" onClick={() => { void save({ expiry: undefined }); }}>
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {qOpen && (
          <motion.div
            id={qId} className="notes-quad" role="radiogroup" aria-label="Priority"
            initial={fast ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={fast ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {QUADRANTS.map(x => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={q === x.id}
                className="notes-quad-btn"
                data-q={x.id}
                onClick={() => { void save({ quadrant: q === x.id ? undefined : x.id }); setQOpen(false); }}
              >
                <span className="notes-quad-dot" aria-hidden="true" />
                <span className="notes-quad-txt"><b>{SHORT[x.id]}</b><small>{x.hint}</small></span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <WhenPicker open={open} value={card.when} onChange={w => { setWhen(w); }} onClose={() => setOpen(false)} />
    </section>
  );
}
