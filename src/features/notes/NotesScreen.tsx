import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive, Bell, CheckSquare, ImagePlus, LayoutGrid, List, Lock, Palette, Search, StickyNote, Trash2, Undo2, X,
} from 'lucide-react';
import './notes.css';
import { useApp } from '../../app-context';
import { restore } from '../../lib/actions';
import { matchesQuery, useCards, useSettings } from '../../lib/hooks';
import type { Card, CardColor } from '../../lib/types';
import { CARD_COLORS } from '../../lib/types';
import { CardTile } from '../../ui/CardTile';
import { EmptyState } from '../../ui/bits';
import { deleteForeverWithUndo, emptyItem, pref, readImages } from './notes-lib';
import { isActive } from '../../lib/types';

type View = 'grid' | 'list';
type Fixed = 'all' | 'tasks' | 'reminders' | 'locked' | 'archive' | 'trash';
type Filter = Fixed | `label:${string}`;

const COLOR_NAME: Record<CardColor, string> = {
  white: 'Default', haldi: 'Haldi yellow', mint: 'Mint', rose: 'Rose', sky: 'Sky', lilac: 'Lilac', sand: 'Sand',
};
const DAY = 864e5;

export default function NotesScreen() {
  const app = useApp();
  const cards = useCards();
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<View>(() => (pref.get('notes.view') === 'list' ? 'list' : 'grid'));
  const [color, setColor] = useState<CardColor | null>(null);
  const [showColors, setShowColors] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const pool = useMemo(() => (cards ?? []).filter(c => c.type === 'note' || c.type === 'task'), [cards]);

  const labels = useMemo(() => {
    const s = new Set(settings.labels);
    for (const c of pool) if (c.status !== 'trashed') c.labels.forEach(l => s.add(l));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [pool, settings.labels]);

  const counts = useMemo(() => ({
    trash: pool.filter(c => c.status === 'trashed').length,
    archive: pool.filter(c => c.status === 'archived').length,
  }), [pool]);

  const hiddenOf = (c: Card) => !!c.locked && !app.isUnlocked(c.id);

  const list = (() => {
    let l: Card[];
    const open = pool.filter(c => isActive(c));
    if (filter === 'all') l = open.filter(c => c.type === 'note');
    else if (filter === 'tasks') l = open.filter(c => c.type === 'task');
    else if (filter === 'reminders') l = open.filter(c => !!c.reminder);
    else if (filter === 'locked') l = open.filter(c => c.locked);
    else if (filter === 'archive') l = pool.filter(c => c.status === 'archived');
    else if (filter === 'trash') l = pool.filter(c => c.status === 'trashed');
    else { const name = filter.slice(6); l = pool.filter(c => (isActive(c) || c.status === 'archived') && c.labels.includes(name)); }
    if (color) l = l.filter(c => c.color === color);
    if (q.trim()) l = l.filter(c => (hiddenOf(c) ? matchesQuery({ ...c, body: '', checklist: undefined }, q) : matchesQuery(c, q)));
    if (filter === 'reminders') l.sort((a, b) => (a.reminder ?? '').localeCompare(b.reminder ?? ''));
    else if (filter === 'tasks') l.sort((a, b) => (a.rank || 0) - (b.rank || 0));
    else if (filter === 'trash') l.sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
    else l.sort((a, b) => b.updatedAt - a.updatedAt);
    return l;
  })();

  const sectioned = filter !== 'trash' && filter !== 'archive' && filter !== 'reminders';
  const pinned = sectioned ? list.filter(c => c.pinned) : [];
  const others = sectioned ? list.filter(c => !c.pinned) : list;

  const setViewPref = (v: View) => { setView(v); pref.set('notes.view', v); };
  const pick = (f: Filter) => { setFilter(f); setConfirmEmpty(false); };

  // ---- create ----
  const baseNew = (): Partial<Card> => {
    const p: Partial<Card> = {};
    if (filter.startsWith('label:')) p.labels = [filter.slice(6)];
    if (color) p.color = color;
    return p;
  };
  const newType = filter === 'tasks' ? 'task' as const : 'note' as const;
  const newNote = () => app.createAndOpen({ type: newType, ...baseNew(), ...(newType === 'task' ? { horizon: 'week' as const } : {}) }, barRef.current);
  const newList = () => app.createAndOpen({ type: newType, ...baseNew(), checklist: [emptyItem()] }, barRef.current);
  const newImage = async (files: FileList | null) => {
    const imgs = await readImages(files);
    if (fileRef.current) fileRef.current.value = '';
    if (!imgs.length) { app.toast('Could not read that image'); return; }
    await app.createAndOpen({ type: 'note', ...baseNew(), images: imgs }, barRef.current);
  };

  // ---- trash ----
  const doRestore = async (c: Card) => { const undo = await restore(c.id); app.toast('Note restored', undo); };
  const doDelete = async (c: Card) => { const undo = await deleteForeverWithUndo([c.id]); app.toast('Deleted forever', undo); };
  const doEmpty = async () => {
    const ids = pool.filter(c => c.status === 'trashed').map(c => c.id);
    setConfirmEmpty(false);
    if (!ids.length) return;
    const undo = await deleteForeverWithUndo(ids);
    app.toast(`${ids.length} ${ids.length === 1 ? 'note' : 'notes'} deleted forever`, undo);
  };

  const open = (c: Card, el: HTMLElement) => {
    if (c.status === 'trashed') { app.toast('Restore this note to edit it'); return; }
    app.openCard(c.id, el);
  };

  const tile = (c: Card) => {
    const t = <CardTile card={c} settings={settings} hidden={hiddenOf(c)} onOpen={el => open(c, el)} />;
    if (c.status !== 'trashed') return <div key={c.id}>{t}</div>;
    const left = Math.max(0, 30 - Math.floor((Date.now() - (c.trashedAt ?? Date.now())) / DAY));
    return (
      <div key={c.id} className="notes-trash-item">
        {t}
        <div className="notes-trash-meta">{left === 0 ? 'Deleted today' : `Deleted in ${left} ${left === 1 ? 'day' : 'days'}`}</div>
        <div className="notes-trash-actions">
          <button type="button" className="btn" onClick={() => doRestore(c)} aria-label={`Restore ${c.title || 'note'}`}>
            <Undo2 size={16} aria-hidden="true" /> Restore
          </button>
          <button type="button" className="btn danger" onClick={() => doDelete(c)} aria-label={`Delete ${c.title || 'note'} forever`}>
            <Trash2 size={16} aria-hidden="true" /> Delete forever
          </button>
        </div>
      </div>
    );
  };

  const grid = (items: Card[]) => <div className={view === 'grid' ? 'masonry' : 'notes-list'}>{items.map(tile)}</div>;

  const loading = cards === undefined;
  const chipsDef: { f: Filter; label: string; icon?: JSX.Element }[] = [
    { f: 'all', label: 'All notes' },
    { f: 'tasks', label: 'Tasks', icon: <CheckSquare size={15} aria-hidden="true" /> },
    ...labels.map(l => ({ f: `label:${l}` as Filter, label: l })),
    { f: 'reminders', label: 'Reminders', icon: <Bell size={15} aria-hidden="true" /> },
    { f: 'locked', label: 'Locked', icon: <Lock size={15} aria-hidden="true" /> },
    { f: 'archive', label: 'Archive', icon: <Archive size={15} aria-hidden="true" /> },
    { f: 'trash', label: counts.trash ? `Trash (${counts.trash})` : 'Trash', icon: <Trash2 size={15} aria-hidden="true" /> },
  ];
  const canCreate = filter !== 'trash' && filter !== 'archive';

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-row">
          <h1 className="screen-title">Notes</h1>
          <div className="notes-top-tools">
            <button type="button" className="icon-btn" aria-label="Filter by colour" aria-pressed={showColors || !!color} onClick={() => setShowColors(v => !v)}>
              <Palette size={20} aria-hidden="true" />
            </button>
            <button type="button" className="icon-btn" aria-label={view === 'grid' ? 'Show as list' : 'Show as grid'} onClick={() => setViewPref(view === 'grid' ? 'list' : 'grid')}>
              {view === 'grid' ? <List size={20} aria-hidden="true" /> : <LayoutGrid size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>
        <div className="topbar-row notes-search-row">
          <div className="search">
            <Search size={18} aria-hidden="true" />
            <label htmlFor="notes-q" className="sr-only">Search notes</label>
            <input id="notes-q" type="search" value={q} placeholder="Search notes" onChange={e => setQ(e.target.value)} />
            {q && (
              <button type="button" className="icon-btn notes-clear" aria-label="Clear search" onClick={() => setQ('')}>
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <div className="chips notes-chips" role="group" aria-label="Show">
          {chipsDef.map(c => (
            <button key={c.f} type="button" className="chip" aria-pressed={filter === c.f} onClick={() => pick(c.f)}>
              {c.icon}{c.label}
            </button>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {showColors && (
            <motion.div className="notes-colors" role="group" aria-label="Colour filter"
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }} transition={{ duration: 0.18 }}>
              <button type="button" className="notes-swatch-btn notes-swatch-any" aria-pressed={color === null} onClick={() => setColor(null)}>Any</button>
              {CARD_COLORS.map(k => (
                <button key={k} type="button" className="notes-swatch-btn" data-color={k} aria-label={COLOR_NAME[k]} aria-pressed={color === k} onClick={() => setColor(color === k ? null : k)}>
                  <span className="notes-swatch" aria-hidden="true" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {canCreate && (
        <div className="notes-take" ref={barRef}>
          <button type="button" className="notes-take-main" onClick={newNote}>
            {filter === 'tasks' ? 'Add a task…' : 'Take a note…'}
          </button>
          <button type="button" className="icon-btn" aria-label={filter === 'tasks' ? 'New task checklist' : 'New checklist'} onClick={newList}>
            <CheckSquare size={20} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" aria-label="New note with image" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={20} aria-hidden="true" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden aria-label="Choose images" onChange={e => newImage(e.target.files)} />
        </div>
      )}

      {filter === 'trash' && (
        <div className="notes-trash-bar">
          <p>Notes in trash are deleted after 30 days.</p>
          {counts.trash > 0 && !confirmEmpty && (
            <button type="button" className="btn danger" onClick={() => setConfirmEmpty(true)}>
              <Trash2 size={16} aria-hidden="true" /> Empty trash
            </button>
          )}
        </div>
      )}
      {filter === 'trash' && confirmEmpty && (
        <div className="notes-confirm" role="alert">
          <p><b>Delete {counts.trash} {counts.trash === 1 ? 'note' : 'notes'} forever?</b> You can undo for a few seconds after.</p>
          <div className="notes-confirm-actions">
            <button type="button" className="btn" onClick={() => setConfirmEmpty(false)}>Cancel</button>
            <button type="button" className="btn danger" onClick={doEmpty}>Delete forever</button>
          </div>
        </div>
      )}

      {loading ? null : list.length === 0 ? (
        <Empty filter={filter} q={q} color={color} onClear={() => { setQ(''); setColor(null); }} onNew={newNote} onBack={() => pick('all')} />
      ) : (
        <motion.div key={`${filter}-${view}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
          {pinned.length > 0 && (
            <>
              <h2 className="sec-label">Pinned</h2>
              {grid(pinned)}
              {others.length > 0 && <h2 className="sec-label">Others</h2>}
            </>
          )}
          {others.length > 0 && grid(others)}
        </motion.div>
      )}
    </div>
  );
}

function Empty({ filter, q, color, onClear, onNew, onBack }: {
  filter: Filter; q: string; color: CardColor | null; onClear: () => void; onNew: () => void; onBack: () => void;
}) {
  if (q.trim() || color) {
    return (
      <EmptyState icon={<Search size={36} aria-hidden="true" />} title={q.trim() ? `Nothing matches “${q.trim()}”` : 'No notes in this colour'}>
        Try another word or colour.
        <div style={{ marginTop: 12 }}><button type="button" className="btn" onClick={onClear}>Clear search</button></div>
      </EmptyState>
    );
  }
  const map: Record<string, { icon: JSX.Element; title: string; text: string; action: 'new' | 'back' }> = {
    all: { icon: <StickyNote size={40} aria-hidden="true" />, title: 'Your notes live here', text: 'Shopping lists, ideas, things to pay. Type ₹ amounts and dates, and Hisaab offers to make a bill or expense.', action: 'new' },
    tasks: { icon: <CheckSquare size={40} aria-hidden="true" />, title: 'No open tasks', text: 'Add a task with a deadline, like “Renew bike insurance by 15 Dec”.', action: 'new' },
    reminders: { icon: <Bell size={40} aria-hidden="true" />, title: 'No reminders', text: 'Open a note and tap the bell to set one.', action: 'new' },
    locked: { icon: <Lock size={40} aria-hidden="true" />, title: 'No locked notes', text: 'Lock a note with a PIN from the lock button in the note.', action: 'new' },
    archive: { icon: <Archive size={40} aria-hidden="true" />, title: 'Archive is empty', text: 'Archived notes stay out of the way but are still searchable here.', action: 'back' },
    trash: { icon: <Trash2 size={40} aria-hidden="true" />, title: 'Trash is empty', text: 'Deleted notes stay here for 30 days.', action: 'back' },
  };
  const e = map[filter] ?? { icon: <StickyNote size={40} aria-hidden="true" />, title: `No notes with “${filter.slice(6)}”`, text: 'New notes you make here get this label.', action: 'new' as const };
  return (
    <EmptyState
      icon={e.icon}
      title={e.title}
      action={e.action === 'new'
        ? <button type="button" className="btn primary" onClick={onNew}>{filter === 'tasks' ? 'Add a task' : 'Take a note'}</button>
        : <button type="button" className="btn" onClick={onBack}>Back to notes</button>}
    >
      {e.text}
    </EmptyState>
  );
}
