import { useState } from 'react';
import { openQuickSearch } from '../../ui/QuickSearch';
import { Search } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCards, useSettings } from '../../lib/hooks';
import { MyOrder } from './MyOrder';
import { Timeline } from './Timeline';
import { Board } from './Board';
import { WeekMonth } from './WeekMonth';
import './plan.css';

type View = 'box' | 'wm' | 'order' | 'time';
const VIEWS: { id: View; label: string }[] = [
  { id: 'wm', label: 'Priorities' },
  { id: 'box', label: '4-box' },
  { id: 'order', label: 'My order' },
  { id: 'time', label: 'Timeline' },
];
const VIEW_KEY = 'hisaab.plan.view';

/** Always open on Priorities. (Restoring the last view made people land on 4-box and miss it.) */
function loadView(): View {
  return 'wm';
}

export default function PlanScreen() {
  const cards = useCards();
  const settings = useSettings();
  const reduce = useReducedMotion();
  const [view, setViewState] = useState<View>(loadView);
  const setView = (v: View) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked */ }
  };

  return (
    <div className="screen plan">
      <header className="topbar">
        <div className="topbar-row plan-head">
          <h1 className="screen-title">Priorities</h1>
          <button type="button" className="icon-btn plan-search" aria-label="Search everything" onClick={openQuickSearch}><Search size={20} aria-hidden="true" /></button>
        </div>
        <div className="plan-seg plan-views" role="group" aria-label="Plan view">
          {VIEWS.map(v => (
            <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>{v.label}</button>
          ))}
        </div>
      </header>

      {cards !== undefined && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0.01 : 0.22, ease: [0.2, 0.8, 0.2, 1] } }}
            exit={{ opacity: 0, transition: { duration: reduce ? 0.01 : 0.12 } }}
          >
            {view === 'box' && <Board cards={cards} />}
            {view === 'wm' && <WeekMonth cards={cards} />}
            {view === 'order' && <MyOrder cards={cards} settings={settings} />}
            {view === 'time' && <Timeline cards={cards} settings={settings} />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
