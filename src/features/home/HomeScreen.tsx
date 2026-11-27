import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListOrdered, Plus, Search, Sparkles, X } from 'lucide-react';
import type { Card, CardType } from '../../lib/types';
import { KIND_LABEL } from '../../lib/types';
import { useApp } from '../../app-context';
import { matchesQuery, useCards, useNavReset, useSettings } from '../../lib/hooks';
import { saveSettings } from '../../lib/db';
import { isTouchDevice, today, todayISO } from '../../lib/format';
import { EmptyState } from '../../ui/bits';
import { NotesBento } from './NotesBento';
import { topFirst } from '../notes/importance';
import { TrackerCards } from './TrackerCards';
import { BudgetPace } from './BudgetPace';
import { QuickTaskSheet } from '../notes/QuickTaskSheet';
import { openQuickSearch } from '../../ui/QuickSearch';
import { isSpend } from '../../lib/logic';
import { cashFlow } from '../money/cashflow';
import { AheadList, DueList, RecentSpends } from './HomeLists';
import { aheadItems } from './helpers';
import { CloseDay } from './CloseDay';
import { BackupNudge } from './BackupNudge';
import { TodayPriorities } from './TodayPriorities';
import { todayPriorities } from './priorities';
import { Fab, type FanPick } from './Fab';
import './home.css';
import { isActive } from '../../lib/types';

type View = 'tracker' | 'notes';
type Filter = 'all' | 'notes' | 'tasks';
const FILTERS: [Filter, string][] = [['all', 'All'], ['notes', 'Notes'], ['tasks', 'Tasks']];
const QuickExpense = lazy(() => import('../money/QuickExpense'));

export default function HomeScreen() {
  const app = useApp();
  const cards = useCards();
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // Home always opens on the Tracker; the switch is tap only so card swipes never clash with it.
  const [view, setView] = useState<View>('tracker');
  const [adding, setAdding] = useState<'expense' | 'income' | null>(null);
  const [tasking, setTasking] = useState(false);
  /** The add screen loads the first time it is asked for, then stays mounted so it can animate closed. */
  const [addLoaded, setAddLoaded] = useState(false);
  const [fanOpen, setFanOpen] = useState(false);
  const [newId, setNewId] = useState<string | null>(null);
  const newTimer = useRef<number>();

  useEffect(() => () => clearTimeout(newTimer.current), []);
  // Home tapped again (or Home from an editor): All, empty search, nothing open.
  useNavReset('home', () => { setView('tracker'); setQ(''); setFilter('all'); setFanOpen(false); setAdding(null); setTasking(false); });
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
  const tracker = view === 'tracker';
  const salary = settings.salaryAmount ?? 0;
  const flow = useMemo(() => cashFlow(cards ?? [], salary, settings.salaryDay, today(), settings.incomes), [cards, salary, settings.salaryDay, settings.incomes, iso]); // eslint-disable-line react-hooks/exhaustive-deps
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
    .slice(0, 5), [cards, iso]);
  // Yearly bills, renewals, expiries, maturities: next 60 days, after this salary.
  const ahead = useMemo(() => aheadItems(cards ?? [], today(), flow.cycle.end), [cards, flow.cycle.end, iso]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Notes view: notes and tasks, pinned first, then your own order. */
  const shown = useMemo(() => {
    const query = q.trim();
    return open
      .filter(c => c.type === 'note' || c.type === 'task')
      .filter(c => filter === 'all' || c.type === (filter === 'notes' ? 'note' : 'task'))
      .filter(c => {
        if (!query) return true;
        const withKind = { ...c, labels: [...c.labels, KIND_LABEL[c.type]] };
        // Locked notes only match on their title, never on hidden text.
        return matchesQuery(isHidden(c) ? { ...withKind, body: '', checklist: undefined, category: undefined } : withKind, query);
      })
      .sort(topFirst);
  }, [open, filter, q, isHidden]);

  /** Note button: a blank note straight into the editor. */
  const quickNote = useCallback((el?: Element | null) => {
    setFanOpen(false);
    void app.createAndOpen({ type: 'note' }, el ?? document.querySelector('.home-fab'));
  }, [app]);
  /** Hold +, then pick a type: opens a new card of that type in its editor. */
  /** The add screen, on Home itself: spend or income. */
  const add = useCallback((kind: 'expense' | 'income') => { setFanOpen(false); setAddLoaded(true); setAdding(kind); }, []);
  const addSpend = useCallback(() => add('expense'), [add]);
  const closeAdd = useCallback(() => setAdding(null), []);

  const pick = useCallback((t: FanPick) => {
    setFanOpen(false);
    if (t === 'spend') addSpend(); else if (t === 'note') quickNote(); else setTasking(true);
  }, [addSpend, quickNote]);

  const closeFan = useCallback(() => setFanOpen(false), []);

  // A card created from the Notes view pops in.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!cards) return;
    const ids = new Set(cards.map(c => c.id));
    const fresh = known.current && cards.find(c => !known.current!.has(c.id) && (c.type === 'note' || c.type === 'task'));
    known.current = ids;
    if (fresh) { setNewId(fresh.id); clearTimeout(newTimer.current); newTimer.current = window.setTimeout(() => setNewId(null), 800); }
  }, [cards]);

  const showHint = !settings.seenSwipeHint && open.length > 0;
  const retireHint = useCallback(() => { if (!settings.seenSwipeHint) void saveSettings({ seenSwipeHint: true }); }, [settings.seenSwipeHint]);

  let notes: JSX.Element | null = null;
  if (cards !== undefined) {
    if (shown.length) notes = <NotesBento cards={shown} settings={settings} isHidden={isHidden} newId={newId} onSwiped={retireHint} />;
    else {
      notes = (
        <EmptyState
          icon={<Sparkles size={40} aria-hidden="true" />}
          title={q ? 'Nothing matches that search' : 'No notes yet'}
          action={q
            ? <button type="button" className="btn" onClick={() => setQ('')}>Clear search</button>
            : <button type="button" className="btn primary" onClick={e => quickNote(e.currentTarget)}><Plus size={18} aria-hidden="true" />Write a note</button>}
        />
      );
    }
  }

  return (
    <div className={`screen home ${tracker ? 'is-tracker' : 'is-notes'}`}>
      <header className="topbar">
        <div className="home-brand">
          <h1 className="screen-title">Hisaab</h1>
          <button type="button" className="icon-btn" aria-label="Search everything" onClick={openQuickSearch}><Search size={20} aria-hidden="true" /></button>
          <a className="icon-btn" href="#plan" aria-label="Reorder cards" title="Reorder: drag cards into your order"><ListOrdered size={20} aria-hidden="true" /></a>
        </div>
        <div className="home-switch" role="tablist" aria-label="Home view">
          {(['tracker', 'notes'] as const).map(v => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => { setView(v); setFanOpen(false); window.scrollTo({ top: 0 }); }}>
              {v === 'tracker' ? 'Tracker' : 'Notes'}
            </button>
          ))}
        </div>
      </header>

      {tracker && cards !== undefined && (
        <>
          <TrackerCards cards={cards} settings={settings} onAdd={add} />
          <BudgetPace cards={cards} settings={settings} />
          <DueList bills={flow.bills} salaryISO={flow.cycle.end} />
          <TodayPriorities items={prio.items} more={prio.more} />
          <RecentSpends spends={recent} cards={cards} incomes={(settings.incomes ?? []).filter(i => i.date <= iso)} />
          <AheadList items={ahead} />
          <CloseDay cards={cards} onSpend={addSpend} />
          <BackupNudge cardCount={cards.filter(c => c.status !== 'trashed').length} settings={settings} />
        </>
      )}

      {!tracker && (
        <>
          <div className="topbar-row">
            <label className="search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Search notes and tasks</span>
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search notes and tasks" autoComplete="off" />
            </label>
            {q && <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQ('')}><X size={20} aria-hidden="true" /></button>}
          </div>
          <div className="chips home-chips" role="group" aria-label="Filter cards">
            {FILTERS.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
          {showHint && shown.length > 0 && (
            <div className="home-hint" role="note">
              <span>
                {isTouchDevice()
                  ? <>Hold a box to pin, rank or resize. Swipe right: done. Left: later {settings.delayDays === 1 ? '(1 day)' : '(1 week)'}.</>
                  : <>Right-click a box to pin, rank or resize.</>}
              </span>
              <button type="button" className="btn ghost" onClick={retireHint}>Got it</button>
            </div>
          )}
          {notes}
        </>
      )}

      <div className="home-dock">
        <Fab fanOpen={fanOpen} active={fanOpen} items={tracker ? ['spend', 'note'] : ['spend', 'note', 'task']}
          onOpen={() => setFanOpen(true)} onPick={pick} onCloseFan={closeFan} />
      </div>

      <QuickTaskSheet open={tasking} onClose={() => setTasking(false)} />

      {addLoaded && <Suspense fallback={null}><QuickExpense open={!!adding} kind={adding ?? 'expense'} onClose={closeAdd} /></Suspense>}
    </div>
  );
}
