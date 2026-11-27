/**
 * Today's priorities: the few things that need you today, at the very top of Home.
 * Tick one off right here (same flow as Plan → Week); tap a row to open it. Styles in home.css.
 */
import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Target } from 'lucide-react';
import type { Card } from '../../lib/types';
import { KIND_LABEL } from '../../lib/types';
import { useApp } from '../../app-context';
import { markDone, payBill } from '../../lib/actions';
import { isCardBill } from '../../lib/logic';
import { askCardPayment } from '../money/CardPaySheet';
import { buzz, inr } from '../../lib/format';
import { DuePill, TYPE_ICON } from '../../ui/CardTile';
import { whenLabel } from '../../ui/WhenPicker';

const titleOf = (c: Card) =>
  c.type === 'note' && c.locked ? 'Locked note'
    : c.title || c.body?.split(/\n/)[0]?.slice(0, 60) || c.checklist?.[0]?.text || 'Untitled';

function Row({ card: c }: { card: Card }) {
  const app = useApp();
  const reduce = useReducedMotion();
  const Icon = TYPE_ICON[c.type];
  const title = titleOf(c);
  const [phase, setPhase] = useState<'idle' | 'ticked' | 'leaving'>('idle');

  const done = async (el: HTMLElement) => {
    // Check pop + strike-through first, then slide away.
    const rect = el.getBoundingClientRect();
    // Card bill: ask how much was paid (prefilled, one tap Confirm). Cancel leaves it as it was.
    const opts = isCardBill(c) ? await askCardPayment(c) : undefined;
    if (opts === null) return;
    setPhase('ticked');
    buzz([8, 40, 14]);
    await new Promise(r => setTimeout(r, reduce ? 0 : 420));
    setPhase('leaving');
    try {
      if (opts) {
        const r = await payBill(c.id, opts);
        app.burst(rect);
        app.toast(`Card bill paid ${inr(r.expense.amount)}. Not a new spend.`, r.undo);
        return;
      }
      const undo = await markDone(c.id);
      if (c.type === 'bill') {
        app.burst(rect);
        app.toast(`Paid ${inr(c.amount)}`, undo);
      } else {
        app.toast(`Done: ${title}`, undo);
      }
    } catch {
      setPhase('idle');
      app.toast('Could not mark that done.');
    }
  };

  return (
    <motion.li layout={!reduce} className={`tp-row is-${phase}`} data-color={c.color}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40 }}
      transition={reduce ? { duration: 0.01 } : { type: 'spring', stiffness: 460, damping: 30 }}>
      <button type="button" className="tp-check" aria-label={c.type === 'bill' ? `Mark ${title} paid` : `Mark ${title} done`}
        onClick={e => void done(e.currentTarget)} disabled={phase !== 'idle'}>
        <Check size={18} aria-hidden="true" />
      </button>
      <button type="button" className="tp-main" onClick={e => app.openCard(c.id, e.currentTarget.closest('li'))}>
        <span className="tp-t">
          <Icon size={15} aria-hidden="true" className="tp-icon" />
          <span className="sr-only">{KIND_LABEL[c.type]}: </span>
          <span className="tp-title">{title}</span>
        </span>
        {(c.due || c.when || !!c.amount) && (
          <span className="pills tp-pills">
            {c.due ? <DuePill due={c.due} /> : null}
            {c.when && <span className="pill accent">{whenLabel(c.when)}</span>}
            {!!c.amount && <span className="pill outline num">{inr(c.amount)}</span>}
          </span>
        )}
      </button>
    </motion.li>
  );
}

export function TodayPriorities({ items, more }: { items: Card[]; more: number }) {
  const reduce = useReducedMotion();
  return (
    <section className="tp" aria-labelledby="tp-h">
      <div className="tp-head">
        <h2 id="tp-h"><Target size={18} aria-hidden="true" /> Today's priorities</h2>
        <a className="tp-link" href="#plan">Open Priorities <ArrowRight size={16} aria-hidden="true" /></a>
      </div>
      {items.length ? (
        <motion.ul className="tp-list" layout={!reduce}>
          <AnimatePresence initial={false}>
            {items.map(c => <Row key={c.id} card={c} />)}
          </AnimatePresence>
        </motion.ul>
      ) : (
        <p className="tp-empty">
          Nothing urgent today.
          <a className="tp-link" href="#plan">Plan your day <ArrowRight size={16} aria-hidden="true" /></a>
        </p>
      )}
      {more > 0 && <a className="tp-more" href="#plan">+{more} more in Priorities</a>}
    </section>
  );
}
