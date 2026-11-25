import { AnimatePresence, motion } from 'framer-motion';
import { CalendarRange, Home, Settings2, StickyNote, Wallet } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppCtx, ROUTES, type AppApi, type Route } from './app-context';
import { db, getSettings } from './lib/db';
import { createCard, purgeOldTrash, type Undo } from './lib/actions';
import { useCard } from './lib/hooks';
import { prefersReducedMotion } from './lib/format';
import { coinBurst } from './ui/fx';

import HomeScreen from './features/home/HomeScreen';
import NotesScreen from './features/notes/NotesScreen';
import MoneyScreen from './features/money/MoneyScreen';
import PlanScreen from './features/plan/PlanScreen';
import SettingsScreen from './features/settings/SettingsScreen';
import Onboarding from './features/settings/Onboarding';

const NoteEditor = lazy(() => import('./features/notes/NoteEditor'));
const EntryEditor = lazy(() => import('./features/money/EntryEditor'));

const NAV: { r: Route; label: string; Icon: typeof Home }[] = [
  { r: 'home', label: 'Home', Icon: Home },
  { r: 'notes', label: 'Notes', Icon: StickyNote },
  { r: 'money', label: 'Money', Icon: Wallet },
  { r: 'plan', label: 'Priorities', Icon: CalendarRange },
  { r: 'more', label: 'More', Icon: Settings2 },
];

const readRoute = (): Route => {
  const h = location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(h) ? h : 'home';
};

function EditorShell({ id, origin, onClose }: { id: string; origin: DOMRect | null; onClose: () => void }) {
  const card = useCard(id);
  const wide = window.innerWidth >= 900;
  const reduce = prefersReducedMotion();
  const W = window.innerWidth, H = window.innerHeight;
  const clipFrom = origin && !wide && !reduce
    ? `inset(${origin.top}px ${W - origin.right}px ${H - origin.bottom}px ${origin.left}px round 16px)`
    : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.sheet')) return;
      // Prefer the editor's own Back button so it can flush saves / discard empty notes.
      const back = document.querySelector<HTMLButtonElement>('.editor .editor-top [aria-label="Back"]');
      if (back) back.click(); else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (card === undefined) return null;
  const Editor = card.type === 'note' || card.type === 'task' ? NoteEditor : EntryEditor;

  const body = (
    <motion.div
      className="editor"
      data-color={card.color}
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${card.type}`}
      initial={clipFrom ? { clipPath: clipFrom } : { opacity: 0, scale: wide ? 0.96 : 1, y: wide ? 0 : 24 }}
      animate={clipFrom ? { clipPath: `inset(0px 0px 0px 0px round 0px)` } : { opacity: 1, scale: 1, y: 0 }}
      exit={clipFrom ? { clipPath: clipFrom, transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] } } : { opacity: 0, scale: 0.97, transition: { duration: 0.16 } }}
      transition={{ duration: 0.36, ease: [0.2, 0.85, 0.25, 1] }}
    >
      <Suspense fallback={null}>
        <Editor id={id} onClose={onClose} />
      </Suspense>
    </motion.div>
  );
  return wide ? (
    <motion.div className="editor-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>{body}</motion.div>
  ) : body;
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [editor, setEditor] = useState<{ id: string; origin: DOMRect | null } | null>(null);
  const [toastState, setToast] = useState<{ msg: string; undo?: Undo; key: number } | null>(null);
  const unlocked = useRef(new Set<string>());
  const [, force] = useState(0);
  const settings = useLiveQuery(() => getSettings(), []);
  const toastTimer = useRef<number>();

  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener('hashchange', on);
    purgeOldTrash().catch(() => {});
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    const t = settings?.theme ?? 'system';
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }, [settings?.theme]);

  const api: AppApi = useMemo(() => ({
    route,
    go: r => { location.hash = r; },
    openCard: (id, from) => setEditor({ id, origin: from ? from.getBoundingClientRect() : null }),
    createAndOpen: async (partial, from) => {
      const c = await createCard(partial);
      setEditor({ id: c.id, origin: from ? from.getBoundingClientRect() : null });
      return c;
    },
    closeEditor: () => setEditor(null),
    toast: (msg, undo) => {
      clearTimeout(toastTimer.current);
      setToast({ msg, undo, key: Date.now() });
      toastTimer.current = window.setTimeout(() => setToast(null), undo ? 5000 : 3200);
    },
    burst: from => coinBurst(from instanceof DOMRect ? from : from.getBoundingClientRect()),
    isUnlocked: id => unlocked.current.has(id),
    unlock: id => { unlocked.current.add(id); force(n => n + 1); },
  }), [route]);

  const closeEditor = useCallback(() => setEditor(null), []);

  if (!settings) return null;
  if (!settings.consentAt) return <AppCtx.Provider value={api}><Onboarding /></AppCtx.Provider>;

  const Screen = { home: HomeScreen, notes: NotesScreen, money: MoneyScreen, plan: PlanScreen, more: SettingsScreen }[route];

  return (
    <AppCtx.Provider value={api}>
      <div className="shell">
        <nav className="nav" aria-label="Main">
          <div className="brand">Hisaab<span>.</span></div>
          {NAV.map(({ r, label, Icon }) => (
            <a key={r} href={`#${r}`} aria-current={route === r ? 'page' : undefined}>
              <span className="ico"><Icon size={22} strokeWidth={2} aria-hidden="true" /></span>{label}
            </a>
          ))}
        </nav>
        <main className="main" id="main">
          {/* Plain CSS fade: no transform/will-change, so fixed bars and sheets stay fixed to the screen. */}
          <div key={route} className="route-fade">
            <Screen />
          </div>
        </main>
      </div>

      <AnimatePresence>
        {editor && <EditorShell key={editor.id} id={editor.id} origin={editor.origin} onClose={closeEditor} />}
      </AnimatePresence>

      <div aria-live="polite" aria-atomic="true">
        <AnimatePresence>
          {toastState && (
            <motion.div key={toastState.key} className="toast" initial={{ opacity: 0, y: 16, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 8, x: '-50%', transition: { duration: 0.15 } }}>
              <span>{toastState.msg}</span>
              {toastState.undo && (
                <button type="button" onClick={async () => { const u = toastState.undo!; setToast(null); await u(); }}>Undo</button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppCtx.Provider>
  );
}

// Keep db referenced so dev tools can inspect it.
(window as unknown as { hisaabDb: typeof db }).hisaabDb = db;
