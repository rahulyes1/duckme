import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { IndianRupee, Plus } from 'lucide-react';
import type { CardColor } from '../../lib/types';
import { TYPE_ICON } from '../../ui/CardTile';
import { useLongPress } from '../../lib/hooks';
import { buzz } from '../../lib/format';

/** What + offers. The Tracker shows Note and Spend; the Notes view shows Note and Task. */
export type FanPick = 'spend' | 'note' | 'task';
const FAN_LABEL: Record<FanPick, string> = { spend: 'Spend', note: 'Note', task: 'Task' };
const FAN_COLOR: Record<FanPick, CardColor> = { spend: 'mint', note: 'white', task: 'sand' };
const FAN_ICON: Record<FanPick, typeof Plus> = { spend: IndianRupee, note: TYPE_ICON.note, task: TYPE_ICON.task };

interface Props {
  fanOpen: boolean;
  /** Rotates to × (fan or quick-add open). */
  active: boolean;
  /** Tap or hold: opens the picker. */
  onOpen: () => void;
  onPick: (t: FanPick) => void;
  /** Choices, nearest the thumb first. */
  items: FanPick[];
  onCloseFan: () => void;
}

/** Floating +: tap (or hold) opens the picker. */
export function Fab({ fanOpen, active, items, onOpen, onPick, onCloseFan }: Props) {
  const reduce = useReducedMotion();
  const fanRef = useRef<HTMLDivElement>(null);
  const lp = useLongPress(() => { buzz(18); onOpen(); });

  useEffect(() => {
    if (!fanOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCloseFan(); } };
    document.addEventListener('keydown', onKey, true);
    // Nav taps (Home again, another tab) close the fan too.
    window.addEventListener('hisaab:dismiss', onCloseFan);
    return () => { document.removeEventListener('keydown', onKey, true); window.removeEventListener('hisaab:dismiss', onCloseFan); };
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
          {fanOpen && items.map((t, i) => {
            const Icon = FAN_ICON[t];
            return (
              <motion.button
                key={t}
                type="button"
                className={`home-pick${t === 'spend' ? ' is-main' : ''}`}
                onClick={() => onPick(t)}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: reduce ? { duration: 0.1 } : { type: 'spring', stiffness: 520, damping: 24, delay: i * 0.04 } }}
                exit={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.9, transition: { duration: 0.12 } }}
                autoFocus={i === 0}
              >
                <span>{FAN_LABEL[t]}</span>
                <i data-color={FAN_COLOR[t]}><Icon size={t === 'spend' ? 26 : 20} aria-hidden="true" /></i>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      <button
        type="button"
        className={`home-fab ${active ? 'is-open' : ''}`}
        aria-label={fanOpen ? 'Close add menu' : `Add ${items.map(i => FAN_LABEL[i].toLowerCase()).join(' or ')}`}
        aria-expanded={fanOpen}
        title="Add"
        aria-keyshortcuts="ArrowUp"
        {...lp.handlers}
        // Arrow Up or right-click open the picker too.
        onKeyDown={e => { if (e.key === 'ArrowUp' && !fanOpen) { e.preventDefault(); onOpen(); } }}
        onContextMenu={e => { e.preventDefault(); if (!fanOpen) onOpen(); }}
        onPointerCancel={lp.handlers.onPointerUp}
        onClick={() => {
          if (lp.fired.current) { lp.fired.current = false; return; }
          if (fanOpen) { onCloseFan(); return; }
          onOpen();
        }}
      >
        <Plus size={26} strokeWidth={2.6} aria-hidden="true" />
      </button>
    </>
  );
}
