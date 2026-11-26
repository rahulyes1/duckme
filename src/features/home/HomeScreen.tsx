import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListOrdered, Plus, Search, Sparkles, X } from 'lucide-react';
import type { Card, CardType } from '../../lib/types';
import { KIND_LABEL } from '../../lib/types';
import { useApp } from '../../app-context';
import { matchesQuery, useCards, useSettings } from '../../lib/hooks';
import { saveSettings } from '../../lib/db';
import { buzz, prefersReducedMotion } from '../../lib/format';
import { EmptyState } from '../../ui/bits';
import { Masonry } from '../../ui/Masonry';
import { SwipeCard } from './SwipeCard';
import { byRank } from '../../lib/logic';
import { newCardDefaults } from './draft';
import { TodayHero } from './TodayHero';
import { CloseDay } from './CloseDay';
import { Fab } from './Fab';
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

  const isHidden = useCallback((c: Card) => !!c.locked && !app.isUnlocked(c.id), [app]);

  // Journal pages live in Notes → Today, not in the Home grid.
  const open = useMemo(() => (cards ?? []).filter(c => isActive(c) && !c.journalDate), [cards]);
  const shown = useMemo(() => {
    const query = q.trim();
    return open
      .filter(c => filter === 'all' || c.type === FILTER_TYPE[filter])
      .filter(c => {
        if (!query) return true;
        const withKind = { ...c, labels: [...c.labels, KIND_LABEL[c.type]] };
        // Locked notes only match on their title, never on hidden text.
        return matchesQuery(isHidden(c) ? { ...withKind, body: '', checklist: undefined, category: undefined } : withKind, query);
      })
      // Your order is the ONLY order (spec §7): due dates, penalties and salary side never move cards.
      .sort(byRank);
  }, [open, filter, q, isHidden]);
  const pinned = shown.filter(c => c.pinned);
  const others = shown.filter(c => !c.pinned);

  /** + tap: a blank note straight into the editor (spec §4). */
  const quickNote = useCallback((el?: Element | null) => {
    setFanOpen(false);
    void app.createAndOpen({ type: 'note' }, el ?? document.querySelector('.home-fab'));
  }, [app]);
  /** Hold +, then pick a type: opens a new card of that type in its editor. */
  const newOfType = useCallback((t: CardType) => {
    setFanOpen(false);
    void app.createAndOpen(newCardDefaults(t), document.querySelector('.home-fab'));
  }, [app]);

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
          Tap + for a quick note. Hold + to pick a task, bill, expense or investment, or choose <b>Type it</b> and write it the way you would say it: <b>bijli 2400 15th</b>.
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
            <span className="sr-only">Search cards</span>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search cards" autoComplete="off" />
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

      {cards !== undefined && open.length > 0 && !q && filter === 'all' && <TodayHero cards={cards} settings={settings} />}
      {cards !== undefined && !q && filter === 'all' && <CloseDay cards={cards} />}

      {showHint && (
        <div className="home-hint" role="note">
          <span>Swipe right to mark paid or done. Swipe left to delay {settings.delayDays === 1 ? 'a day' : 'a week'}, keep going to kill.</span>
          <button type="button" className="btn ghost" onClick={retireHint}>Got it</button>
        </div>
      )}

      {content}

      <div className="home-dock">
        <Fab
          fanOpen={fanOpen}
          active={fanOpen || sheet.open}
          onTap={() => quickNote()}
          onHold={() => setFanOpen(true)}
          onPick={newOfType}
          onTypeIt={() => openSheet(null)}
          onCloseFan={closeFan}
        />
      </div>

      <QuickAdd open={sheet.open} preset={sheet.type} onClose={closeSheet} onAdded={onAdded} />
    </div>
  );
}
