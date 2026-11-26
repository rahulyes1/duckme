import { AnimatePresence, motion } from 'framer-motion';
import { IndianRupee, Plus, Receipt, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useApp } from '../../app-context';
import { prefersReducedMotion } from '../../lib/format';
import { useCards, useSettings } from '../../lib/hooks';
import type { CardType } from '../../lib/types';
import BillsTab from './BillsTab';
import ExpensesTab from './ExpensesTab';
import InvestTab from './InvestTab';
import GoalsTab from './GoalsTab';
import { DEFAULTS, isLive } from './money-util';
import OverviewTab from './OverviewTab';
import { readPref, writePref } from './parts';
import QuickExpense from './QuickExpense';
import './money.css';

type AddType = Extract<CardType, 'expense' | 'bill' | 'invest'>;
const TABS = ['overview', 'expenses', 'bills', 'invest', 'goals'] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = { overview: 'Overview', expenses: 'Expenses', bills: 'Bills', invest: 'Invest', goals: 'Goals' };
const TAB_KEY = 'hisaab.money.tab';

/* ---------------- add menu ---------------- */
function AddMenu({ onPick }: { onPick: (t: AddType, el: HTMLElement) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), 30);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const items: { t: AddType; label: string; Icon: typeof Plus }[] = [
    { t: 'expense', label: 'Detailed expense', Icon: IndianRupee },
    { t: 'bill', label: 'Bill', Icon: Receipt },
    { t: 'invest', label: 'Investment', Icon: TrendingUp },
  ];
  return (
    <div className="money-add" ref={wrap}>
      <button ref={btn} type="button" className="btn" aria-haspopup="menu" aria-label="Add bill, investment or detailed expense" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Plus size={18} aria-hidden="true" /> <span className="money-add-label">Add</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="money-menu" role="menu" aria-label="Add money entry"
            initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }} transition={{ duration: 0.16 }}
            onKeyDown={e => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
              e.preventDefault();
              const els = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
              const i = els.indexOf(document.activeElement as HTMLElement);
              els[(i + (e.key === 'ArrowDown' ? 1 : els.length - 1)) % els.length]?.focus();
            }}
          >
            {items.map(({ t, label, Icon }) => (
              <button key={t} type="button" role="menuitem" className="money-menu-item"
                onClick={e => { const el = e.currentTarget; setOpen(false); onPick(t, el); }}>
                <Icon size={18} aria-hidden="true" /> {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- screen ---------------- */
export default function MoneyScreen() {
  const { createAndOpen } = useApp();
  const cards = useCards();
  const settings = useSettings();
  const [tab, setTabState] = useState<Tab>(() => readPref(TAB_KEY, TABS, 'overview'));
  const [spend, setSpend] = useState(false);
  const closeSpend = useCallback(() => setSpend(false), []);
  // "New expense" home-screen shortcut: App sets this flag, then routes here.
  useEffect(() => {
    try { if (sessionStorage.getItem('hisaab.quickSpend')) { sessionStorage.removeItem('hisaab.quickSpend'); setSpend(true); } } catch { /* storage blocked */ }
  }, []);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const setTab = (t: Tab) => { setTabState(t); writePref(TAB_KEY, t); };
  const add = (t: AddType, el?: HTMLElement | null) => { void createAndOpen(DEFAULTS[t](), el); };

  // Scroll to the top when switching tabs so the new tab starts at its beginning.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo({ top: 0 });
  }, [tab]);

  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = TABS.indexOf(tab);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    setTab(TABS[n]);
    tabRefs.current[TABS[n]]?.focus();
  };

  if (!cards) return <div className="screen" />;
  const reduce = prefersReducedMotion();
  const live = cards.filter(isLive);

  return (
    <div className="screen money">
      <header className="topbar">
        <div className="topbar-row">
          <h1 className="screen-title">Money</h1>
          <span style={{ flex: 1 }} />
          <AddMenu onPick={(t, el) => add(t, el)} />
          <button type="button" className="btn primary money-spend" onClick={() => setSpend(true)}>
            <Plus size={20} strokeWidth={2.6} aria-hidden="true" /> Spend
          </button>
        </div>
        <div className="money-tabs" role="tablist" aria-label="Money sections" onKeyDown={onTabKey}>
          {TABS.map(t => (
            <button key={t} ref={el => { tabRefs.current[t] = el; }} type="button" role="tab" id={`money-tab-${t}`}
              aria-selected={tab === t} aria-controls={`money-panel-${t}`} tabIndex={tab === t ? 0 : -1}
              className="money-tab" onClick={() => setTab(t)}>
              {tab === t && <motion.span layoutId="money-tab-pill" className="money-tab-pill" aria-hidden="true"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }} />}
              <span className="money-tab-text">{TAB_LABEL[t]}</span>
            </button>
          ))}
        </div>
      </header>

      <div role="tabpanel" id={`money-panel-${tab}`} aria-labelledby={`money-tab-${tab}`} className="money-panel">
        {tab === 'overview' && <OverviewTab cards={live} settings={settings} onSpend={() => setSpend(true)} onTab={setTab} />}
        {tab === 'expenses' && <ExpensesTab cards={live} settings={settings} />}
        {tab === 'bills' && <BillsTab cards={live} settings={settings} />}
        {tab === 'invest' && <InvestTab cards={live} onAdd={el => add('invest', el)} />}
        {tab === 'goals' && <GoalsTab settings={settings} />}
      </div>

      <QuickExpense open={spend} onClose={closeSpend} />
    </div>
  );
}
