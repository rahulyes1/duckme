import { AnimatePresence, motion } from 'framer-motion';
import { IndianRupee, Plus, Receipt, Search, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useApp } from '../../app-context';
import { prefersReducedMotion, today } from '../../lib/format';
import { useCards, useNavReset, useSettings } from '../../lib/hooks';
import { peekNavReset } from '../../lib/prefs';
import type { CardType } from '../../lib/types';
import BillsTab from './BillsTab';
import ExpensesTab from './ExpensesTab';
import InvestTab from './InvestTab';
import { DepositSlip } from './DepositSlip';
import GoalsTab from './GoalsTab';
import { DEFAULTS, isLive, monthStart } from './money-util';
import OverviewTab from './OverviewTab';
import { readPref, writePref } from './parts';
import QuickExpense from './QuickExpense';
import './money.css';
import { openQuickSearch } from '../../ui/QuickSearch';

type AddType = Extract<CardType, 'expense' | 'bill' | 'invest'>;
const TABS = ['overview', 'expenses', 'bills', 'invest', 'goals'] as const;
type Tab = typeof TABS[number];
/** Three tabs on top; Plan holds Bills, Invest and Goals. The saved tab names stay the old ones. */
const PLAN_TABS = ['bills', 'invest', 'goals'] as const;
const PLAN_LABEL = { bills: 'Bills', invest: 'Invest', goals: 'Goals' } as const;
const GROUPS = ['stats', 'general', 'plan'] as const;
type Group = typeof GROUPS[number];
const GROUP_LABEL: Record<Group, string> = { stats: 'Stats', general: 'General', plan: 'Plan' };
const groupOf = (t: Tab): Group => (t === 'overview' ? 'stats' : t === 'expenses' ? 'general' : 'plan');
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
  // Opened from the bottom menu: always Overview. Otherwise (a link, coming back from an editor) the last tab.
  const [tab, setTabState] = useState<Tab>(() => (peekNavReset('money') ? 'overview' : readPref(TAB_KEY, TABS, 'overview')));
  const [gen, setGen] = useState(0);
  const [spend, setSpend] = useState(false);
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const openAdd = useCallback((k: 'expense' | 'income') => { setKind(k); setSpend(true); }, []);
  // One selected month shared by Expenses and Bills, so switching tabs keeps you in the same month.
  const [month, setMonth] = useState<Date>(() => monthStart(today()));
  const closeSpend = useCallback(() => setSpend(false), []);
  // "New expense" home-screen shortcut: App sets this flag, then routes here.
  useEffect(() => {
    const check = () => { try { if (sessionStorage.getItem('hisaab.quickSpend')) { sessionStorage.removeItem('hisaab.quickSpend'); openAdd('expense'); } } catch { /* storage blocked */ } };
    check();
    window.addEventListener('hisaab:spend', check);
    return () => window.removeEventListener('hisaab:spend', check);
  }, []);
  // Money tab tapped again: back to Overview, this month, filters cleared (the panel remounts).
  useNavReset('money', () => { setTabState('overview'); setMonth(monthStart(today())); setSlip(false); setGen(g => g + 1); });
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastPlan = useRef<typeof PLAN_TABS[number]>('bills');

  const setTab = (t: Tab) => { setTabState(t); writePref(TAB_KEY, t); };
  const [slip, setSlip] = useState(false);
  const add = (t: AddType, el?: HTMLElement | null) => { if (t === 'invest') { setSlip(true); return; } void createAndOpen(DEFAULTS[t](), el); };

  // Scroll to the top when switching tabs so the new tab starts at its beginning.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo({ top: 0 });
  }, [tab]);

  const group = groupOf(tab);
  if (group === 'plan') lastPlan.current = tab as typeof PLAN_TABS[number];
  const openGroup = (g: Group) => setTab(g === 'stats' ? 'overview' : g === 'general' ? 'expenses' : lastPlan.current);

  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = GROUPS.indexOf(group);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % GROUPS.length;
    else if (e.key === 'ArrowLeft') n = (i + GROUPS.length - 1) % GROUPS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = GROUPS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    openGroup(GROUPS[n]);
    tabRefs.current[GROUPS[n]]?.focus();
  };

  if (!cards) return <div className="screen" />;
  const reduce = prefersReducedMotion();
  const live = cards.filter(isLive);

  return (
    <div className="screen money">
      <header className="topbar">
        <div className="topbar-row">
          <h1 className="screen-title">Money</h1>
          <button type="button" className="icon-btn money-search" aria-label="Search everything" onClick={openQuickSearch}><Search size={20} aria-hidden="true" /></button>
          <span style={{ flex: 1 }} />
          <AddMenu onPick={(t, el) => add(t, el)} />
          <button type="button" className="btn primary money-spend" onClick={() => openAdd('expense')}>
            <Plus size={20} strokeWidth={2.6} aria-hidden="true" /> Spend
          </button>
        </div>
        <div className="money-tabs" role="tablist" aria-label="Money sections" onKeyDown={onTabKey}>
          {GROUPS.map(g => (
            <button key={g} ref={el => { tabRefs.current[g] = el; }} type="button" role="tab" id={`money-tab-${g}`}
              aria-selected={group === g} aria-controls="money-panel" tabIndex={group === g ? 0 : -1}
              className="money-tab" onClick={() => openGroup(g)}>
              {group === g && <motion.span layoutId="money-tab-pill" className="money-tab-pill" aria-hidden="true"
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }} />}
              <span className="money-tab-text">{GROUP_LABEL[g]}</span>
            </button>
          ))}
        </div>
        {group === 'plan' && (
          <div className="donut-ranges plan-sub" role="group" aria-label="Plan sections">
            {PLAN_TABS.map(t => <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>{PLAN_LABEL[t]}</button>)}
          </div>
        )}
      </header>

      <div role="tabpanel" id="money-panel" aria-labelledby={`money-tab-${group}`} className="money-panel">
        <div key={`${tab}:${gen}`} className="money-panel-anim">
        {tab === 'overview' && <OverviewTab cards={live} settings={settings} onSpend={() => openAdd('expense')} />}
        {tab === 'expenses' && <ExpensesTab cards={live} settings={settings} month={month} setMonth={setMonth} onAdd={openAdd} />}
        {tab === 'bills' && <BillsTab cards={live} settings={settings} month={month} setMonth={setMonth} />}
        {tab === 'invest' && <InvestTab cards={live} onAdd={el => add('invest', el)} />}
        {tab === 'goals' && <GoalsTab settings={settings} />}
        </div>
      </div>

      <QuickExpense open={spend} kind={kind} onClose={closeSpend} />
      <DepositSlip open={slip} onClose={() => setSlip(false)} />
    </div>
  );
}
