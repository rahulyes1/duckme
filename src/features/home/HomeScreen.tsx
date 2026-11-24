import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Sparkles, X } from 'lucide-react';
import type { Card, CardType } from '../../lib/types';
import { KIND_LABEL } from '../../lib/types';
import { useApp } from '../../app-context';
import { matchesQuery, useCards, useSettings } from '../../lib/hooks';
import { saveSettings } from '../../lib/db';
import { buzz, prefersReducedMotion, today } from '../../lib/format';
import { EmptyState } from '../../ui/bits';
import { SwipeCard } from './SwipeCard';
import { SalaryStrip } from './SalaryStrip';
import { Fab } from './Fab';
import { QuickAdd } from './QuickAdd';
import './home.css';

type Filter = 'all' | 'notes' | 'tasks' | 'bills' | 'money' | 'invest';
const FILTERS: [Filter, string][] = [['all', 'All'], ['notes', 'Notes'], ['tasks', 'Tasks'], ['bills', 'Bills'], ['money', 'Money'], ['invest', 'Invest']];
const FILTER_TYPE: Record<Exclude<Filter, 'all'>, CardType> = { notes: 'note', tasks: 'task', bills: 'bill', money: 'expense', invest: 'invest' };

const newestFirst = (a: Card, b: Card) => b.createdAt - a.createdAt;

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

  const open = useMemo(() => (cards ?? []).filter(c => c.status === 'open'), [cards]);
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
      .sort(newestFirst);
  }, [open, filter, q, isHidden]);
  const pinned = shown.filter(c => c.pinned);
  const others = shown.filter(c => !c.pinned);

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

  const dateLabel = today().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  const grid = (list: Card[]) => (
    <div className="masonry home-grid" key={filter}>
      {list.map(c => (
        <SwipeCard key={c.id} card={c} settings={settings} hidden={isHidden(c)} isNew={c.id === newId} onSwiped={retireHint} />
      ))}
    </div>
  );

  let content: JSX.Element | null = null;
  if (cards !== undefined) {
    if (!open.length) {
      content = (
        <EmptyState
          icon={<Sparkles size={40} aria-hidden="true" />}
          title="Your hisaab starts here"
          action={<button type="button" className="btn primary" onClick={() => openSheet(null)}><Plus size={18} aria-hidden="true" />Add your first card</button>}
        >
          Type it the way you would say it: <b>bijli 2400 15th</b>, <b>chai 40</b>, <b>PUC renew karna kal</b>. Hisaab works out if it is a note, task, bill, expense or investment.
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
          <span className="home-date">{dateLabel}</span>
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
        </div>
        <div className="chips home-chips" role="group" aria-label="Filter cards">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </header>

      {showHint && (
        <div className="home-hint" role="note">
          <span>Swipe right to mark paid or done. Swipe left to delay a week, keep going to kill.</span>
          <button type="button" className="btn ghost" onClick={retireHint}>Got it</button>
        </div>
      )}

      {content}

      <div className="home-dock">
        <Fab
          fanOpen={fanOpen}
          active={fanOpen || sheet.open}
          onTap={() => openSheet(null)}
          onHold={() => setFanOpen(true)}
          onPick={t => openSheet(t)}
          onCloseFan={closeFan}
        />
        <SalaryStrip cards={open} salaryDay={settings.salaryDay} />
      </div>

      <QuickAdd open={sheet.open} preset={sheet.type} onClose={closeSheet} onAdded={onAdded} />
    </div>
  );
}
