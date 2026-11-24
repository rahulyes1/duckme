import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCards, useSettings } from '../../lib/hooks';
import { MyOrder } from './MyOrder';
import { Timeline } from './Timeline';
import './plan.css';

type View = 'order' | 'time';

export default function PlanScreen() {
  const cards = useCards();
  const settings = useSettings();
  const [view, setView] = useState<View>('order');

  return (
    <div className="screen plan">
      <header className="topbar">
        <div className="topbar-row plan-head">
          <h1 className="screen-title">Plan</h1>
        </div>
        <div className="plan-seg plan-views" role="group" aria-label="Plan view">
          <button type="button" aria-pressed={view === 'order'} onClick={() => setView('order')}>My order</button>
          <button type="button" aria-pressed={view === 'time'} onClick={() => setView('time')}>Timeline</button>
        </div>
      </header>

      {cards !== undefined && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            {view === 'order' ? <MyOrder cards={cards} settings={settings} /> : <Timeline cards={cards} settings={settings} />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
