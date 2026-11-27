import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, IndianRupee, ListOrdered, Plus, Receipt, Search, Sparkles, StickyNote, X } from 'lucide-react';
import type { Card, CardType } from '../../lib/types';
import { KIND_LABEL } from '../../lib/types';
import { useApp } from '../../app-context';
import { matchesQuery, useCards, useNavReset, useSettings } from '../../lib/hooks';
import { saveSettings } from '../../lib/db';
import { buzz, inr, isTouchDevice, prefersReducedMotion, today, todayISO } from '../../lib/format';
import { EmptyState } from '../../ui/bits';
import { Masonry } from '../../ui/Masonry';
import { SwipeCard } from './SwipeCard';
import { byRank, isSpend } from '../../lib/logic';
import { cashFlow } from '../money/cashflow';
import { AheadList, DueList, RecentSpends } from './HomeLists';
import { aheadItems } from './helpers';
import { newCardDefaults } from './draft';
import { TodayHero } from './TodayHero';
import { CloseDay } from './CloseDay';
import { BackupNudge } from './BackupNudge';
import { TodayPriorities } from './TodayPriorities';
import { todayPriorities } from './priorities';
import { Fab, type FanPick } from './Fab';
import { QuickAdd } from './QuickAdd';
import './home.css';
import { isActive } from '../../lib/types';

type Filter = 'all' | 'notes' | 'tasks' | 'bills' | 'expenses' | 'invest';
const FILTERS: [Filter, string][] = [['all', 'All'], ['notes', 'Notes'], ['tasks', 'Tasks'], ['bills', 'Bills'], ['expenses', 'Expenses'], ['invest', 'Invest']];
const FILTER_TYPE: Record<Exclude<Filter, 'all'>, CardType> = { notes: 'note', tasks: 'task', bills: 'bill', expenses: 'expense', invest: 'invest' };

export default function HomeScreen() {
  const app = useApp();
  const cards = useCards();
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sheet, setSheet] = useState<{ open: boolean; type: CardType | null }>({ open: false, type: null });
  const [fanOpen, setFanOpen] = useState(false);
  const [newId, setNewId] = useState<string | null>(null);
  const newTimer = useRef<number>();

  useEffect(() => () => clearTimeout(newTimer.current), []);
  // Home tapped again (or Home from an editor): All, empty search, nothing open.
  useNavReset('home', () => { setQ(''); setFilter('all'); setFanOpen(false); setSheet(s => ({ ...s, open: false })); });
  // Re-render when the app comes back to the front, so priorities and the month total follow the date.
  const [, wake] = useState(0);
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') wake(n => n + 1); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const iso = todayISO();

  const isHidden = useCallback((c: Card) => !!c.locked && !app.isUnlocked(c.id), [app]);

  // Journal pages live in Notes → Today, not in the Home grid.
  const open = useMemo(() => (cards ?? []).filter(c => isActive(c) && !c.journalDate), [cards]);
  const home = !q.trim() && filter === 'all';
  const salary = settings.salaryAmount ?? 0;
  const flow = useMemo(() => cashFlow(cards ?? [], salary, settings.salaryDay, today()), [cards, salary, settings.salaryDay, iso]); // eslint-disable-line react-hooks/exhaustive-deps
  // Bills due before salary get their own list (with Pay), so priorities skip them. Three of each.
  const dueIds = useMemo(() => new Set(flow.bills.slice(0, 3).map(b => b.card.id)), [flow]);
  const prio = useMemo(() => {
    const all = todayPriorities(cards ?? [], today(), 99);
    const rest = all.items.filter(c => !dueIds.has(c.id));
    return { items: rest.slice(0, 3), more: Math.max(0, rest.length - 3) };
  }, [cards, iso, dueIds]); // eslint-disable-line react-hooks/exhaustive-deps
  // The last three real spends (not investments, not card-bill payments).
  const recent = useMemo(() => (cards ?? [])
    .filter(c => isSpend(c) && !!c.date && c.date <= iso)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.createdAt - a.createdAt)
    .slice(0, 3), [cards, iso]);
  // Yearly bills, renewals, expiries, maturities: next 60 days, after this salary.
  const ahead = useMemo(() => aheadItems(cards ?? [], today(), flow.cycle.end), [cards, flow.cycle.end, iso]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    const query = q.trim();
    const inStrip = new Set([...prio.items.map(c => c.id), ...dueIds]);
    return open
      .filter(c => filter === 'all' || c.type === FILTER_TYPE[filter])
      // On All with no search: spends live in Money, and today's priorities are already in the strip above.
      .filter(c => query || filter !== 'all' || ((c.pinned || c.type !== 'expense') && !inStrip.has(c.id)))
      .filter(c => {
        if (!query) return true;
        const withKind = { ...c, labels: [...c.labels, KIND_LABEL[c.type]] };
        // Locked notes only match on their title, never on hidden text.
        return matchesQuery(isHidden(c) ? { ...withKind, body: '', checklist: undefined, category: undefined } : withKind, query);
      })
      // Your order is the ONLY order (spec §7): due dates, penalties and salary side never move cards.
      .sort(byRank);
  }, [open, filter, q, isHidden, prio, dueIds]);
  const pinned = shown.filter(c => c.pinned);
  const others = shown.filter(c => !c.pinned);

  /** Note button: a blank note straight into the editor. */
  const quickNote = useCallback((el?: Element | null) => {
    setFanOpen(false);
    void app.createAndOpen({ type: 'note' }, el ?? document.querySelector('.home-fab'));
  }, [app]);
  /** Hold +, then pick a type: opens a new card of that type in its editor. */
  const newOfType = useCallback((t: CardType) => {
    setFanOpen(false);
    void app.createAndOpen(newCardDefaults(t), document.querySelector('.home-fab'));
  }, [app]);

  /** Spend is one tap from Home: open Money with the quick spend sheet ready. */
  const addSpend = useCallback(() => {
    try { sessionStorage.setItem('hisaab.quickSpend', '1'); } catch { /* storage blocked */ }
    app.go('money');
    window.dispatchEvent(new Event('hisaab:spend'));
  }, [app]);

  /** + picker: Spend opens the spend sheet, the rest open a new card of that type. */
  const pick = useCallback((t: FanPick) => {
    setFanOpen(false);
    if (t === 'spend') addSpend(); else newOfType(t);
  }, [addSpend, newOfType]);

  const closeSheet = useCallback(() => setSheet(s => ({ ...s, open: false })), []);
  const closeFan = useCallback(() => setFanOpen(false), []);
  const openSheet = useCallback((type: CardType | null) => { setFanOpen(false); setSheet({ open: true, type }); }, []);

  const onAdded = useCallback((c: Card) => {
    setFilter('all');
    setQ('');
    setNewId(c.id);
    clearTimeout(newTimer.current);
    newTimer.current = window.setTimeout(() => setNewId(null), 800);
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    buzz(12);
    app.toast(`Added as ${KIND_LABEL[c.type].toLowerCase()}.`);
  }, [app]);

  const showHint = !settings.seenSwipeHint && open.length > 0;
  const retireHint = useCallback(() => { if (!settings.seenSwipeHint) void saveSettings({ seenSwipeHint: true }); }, [settings.seenSwipeHint]);

  const grid = (list: Card[]) => (
    <Masonry
      key={filter}
      className="home-grid"
      items={list}
      keyOf={c => c.id}
      render={c => <SwipeCard card={c} settings={settings} hidden={isHidden(c)} isNew={c.id === newId} onSwiped={retireHint} />}
    />
  );

  let content: JSX.Element | null = null;
  if (cards !== undefined) {
    if (!open.length) {
      content = (
        <EmptyState
          icon={<Sparkles size={40} aria-hidden="true" />}
          title="Your hisaab starts here"
          action={<button type="button" className="btn primary" onClick={e => quickNote(e.currentTarget)}><Plus size={18} aria-hidden="true" />Write your first note</button>}
        >
          Tap + or try <b>bijli 2400 15th</b>.
        </EmptyState>
      );
    } else if (!shown.length && home) {
      content = (
        <EmptyState
          icon={<Sparkles size={40} aria-hidden="true" />}
          title="All clear"
          action={<button type="button" className="btn primary" onClick={e => quickNote(e.currentTarget)}><Plus size={18} aria-hidden="true" />Write a note</button>}
        >
          Spends live in Money.
        </EmptyState>
      );
    } else if (!shown.length) {
      content = (
        <EmptyState
          icon={<Search size={36} aria-hidden="true" />}
          title={q ? 'No cards match that search' : 'Nothing here yet'}
          action={
            <button type="button" className="btn" onClick={() => { setQ(''); setFilter('all'); }}>
              {q ? 'Clear search' : 'Show all cards'}
            </button>
          }
        />
      );
    } else {
      content = (
        <>
          {pinned.length > 0 && <><h2 className="sec-label">Pinned</h2>{grid(pinned)}</>}
          {others.length > 0 && <>{pinned.length > 0 ? <h2 className="sec-label">Others</h2> : <div className="home-gap" />}{grid(others)}</>}
        </>
      );
    }
  }

  return (
    <div className="screen home">
      <header className="topbar">
        <div className="home-brand">
          <h1 className="screen-title">Hisaab</h1>
        </div>
        <div className="topbar-row">
          <label className="search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search notes, tasks and bills</span>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search notes, tasks, bills" autoComplete="off" />
          </label>
          {q && (
            <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQ('')}><X size={20} aria-hidden="true" /></button>
          )}
          <a className="icon-btn" href="#plan" aria-label="Reorder cards" title="Reorder: drag cards into your order"><ListOrdered size={20} aria-hidden="true" /></a>
        </div>
        <div className="chips home-chips" role="group" aria-label="Filter cards">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </header>

      {cards !== undefined && open.length > 0 && home && <TodayHero cards={cards} settings={settings} flow={flow} />}
      {cards !== undefined && home && (
        <div className="home-quick" role="group" aria-label="Add">
          <button type="button" className="hq is-main" onClick={addSpend}><IndianRupee size={18} aria-hidden="true" />Spend</button>
          <button type="button" className="hq" onClick={e => quickNote(e.currentTarget)}><StickyNote size={18} aria-hidden="true" />Note</button>
          <button type="button" className="hq" onClick={() => newOfType('task')}><CheckSquare size={18} aria-hidden="true" />Task</button>
          <button type="button" className="hq" onClick={() => newOfType('bill')}><Receipt size={18} aria-hidden="true" />Bill</button>
        </div>
      )}
      {cards !== undefined && open.length > 0 && home && <DueList bills={flow.bills} salaryISO={flow.cycle.end} />}
      {cards !== undefined && open.length > 0 && home && <TodayPriorities items={prio.items} more={prio.more} />}
      {cards !== undefined && open.length > 0 && home && <AheadList items={ahead} />}
      {cards !== undefined && home && <RecentSpends spends={recent} cards={cards} />}
      {cards !== undefined && !q && filter === 'all' && <CloseDay cards={cards} onSpend={addSpend} />}
      {cards !== undefined && !q && filter === 'all' && <BackupNudge cardCount={cards.filter(c => c.status !== 'trashed').length} settings={settings} />}

      {showHint && (
        <div className="home-hint" role="note">
          <span>
            {isTouchDevice()
              ? <>Swipe right: done. Left: later {settings.delayDays === 1 ? '(1 day)' : '(1 week)'}.</>
              : <>Open a card to mark it done.</>}
          </span>
          <button type="button" className="btn ghost" onClick={retireHint}>Got it</button>
        </div>
      )}

      {content}

      <div className="home-dock">
        <Fab
          fanOpen={fanOpen}
          active={fanOpen || sheet.open}
          onOpen={() => setFanOpen(true)}
          onPick={pick}
          onTypeIt={() => openSheet(null)}
          onCloseFan={closeFan}
        />
      </div>

      <QuickAdd open={sheet.open} preset={sheet.type} onClose={closeSheet} onAdded={onAdded} />
    </div>
  );
}
