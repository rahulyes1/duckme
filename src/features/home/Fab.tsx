import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plus } from 'lucide-react';
import type { CardColor, CardType } from '../../lib/types';
import { KIND_LABEL } from '../../lib/types';
import { TYPE_ICON } from '../../ui/CardTile';
import { useLongPress } from '../../lib/hooks';
import { buzz } from '../../lib/format';

const FAN: CardType[] = ['note', 'task', 'bill', 'expense', 'invest'];
const FAN_COLOR: Record<CardType, CardColor> = { note: 'haldi', task: 'sky', bill: 'rose', expense: 'white', invest: 'mint' };

interface Props {
  fanOpen: boolean;
  /** Rotates to × (fan or quick-add open). */
  active: boolean;
  onTap: () => void;
  onHold: () => void;
  onPick: (t: CardType) => void;
  onCloseFan: () => void;
}

/** Floating +: tap = quick add, hold = fan of the five card types. */
export function Fab({ fanOpen, active, onTap, onHold, onPick, onCloseFan }: Props) {
  const reduce = useReducedMotion();
  const fanRef = useRef<HTMLDivElement>(null);
  const lp = useLongPress(() => { buzz(18); onHold(); });

  useEffect(() => {
    if (!fanOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCloseFan(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [fanOpen, onCloseFan]);

  return (
    <>
      <AnimatePresence>
        {fanOpen && (
          <motion.div
            key="scrim"
            className="home-fan-scrim"
            onClick={onCloseFan}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          />
        )}
      </AnimatePresence>

      <div ref={fanRef} className="home-fan" role="group" aria-label="Pick a card type">
        <AnimatePresence>
          {fanOpen && FAN.map((t, i) => {
            const Icon = TYPE_ICON[t];
            return (
              <motion.button
                key={t}
                type="button"
                className="home-pick"
                onClick={() => onPick(t)}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: reduce ? { duration: 0.1 } : { type: 'spring', stiffness: 520, damping: 24, delay: i * 0.04 } }}
                exit={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.9, transition: { duration: 0.12 } }}
                autoFocus={i === 0}
              >
                <span>{KIND_LABEL[t]}</span>
                <i data-color={FAN_COLOR[t]}><Icon size={20} aria-hidden="true" /></i>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      <button
        type="button"
        className={`home-fab ${active ? 'is-open' : ''}`}
        aria-label={fanOpen ? 'Close type picker' : 'Add card. Hold to pick a type'}
        aria-expanded={fanOpen}
        title="Tap to add, hold to pick a type"
        {...lp.handlers}
        onPointerCancel={lp.handlers.onPointerUp}
        onClick={() => {
          if (lp.fired.current) { lp.fired.current = false; return; }
          if (fanOpen) { onCloseFan(); return; }
          onTap();
        }}
      >
        <Plus size={26} strokeWidth={2.6} aria-hidden="true" />
      </button>
    </>
  );
}
