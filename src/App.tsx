import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { parseBankSms } from './lib/capture';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { QuickSearch, openQuickSearch } from './ui/QuickSearch';
import { CardPayHost } from './features/money/CardPaySheet';
import { Search } from 'lucide-react';
import { startReminderLoop } from './lib/notify';
import { CalendarRange, Home, Settings2, StickyNote, Wallet } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppCtx, ROUTES, type AppApi, type Route } from './app-context';
import { db, getSettings } from './lib/db';
import { createCard, purgeOldTrash, type Undo } from './lib/actions';
import { useCard } from './lib/hooks';
import { prefersReducedMotion } from './lib/format';
import { Ambient } from './ui/Ambient';
import { clearIncomingShare, readIncomingShare, shareToNote } from './features/notes/share';
import { NAV_RESET, clearNavReset, markNavReset } from './lib/prefs';

import HomeScreen from './features/home/HomeScreen';
// Home ships in the first download; the other screens load when first opened
// (and are fetched quietly in the background once the app is idle, so tabs still feel instant).
const loadNotes = () => import('./features/notes/NotesScreen');
const loadMoney = () => import('./features/money/MoneyScreen');
const loadPlan = () => import('./features/plan/PlanScreen');
const loadMore = () => import('./features/settings/SettingsScreen');
const NotesScreen = lazy(loadNotes);
const MoneyScreen = lazy(loadMoney);
const PlanScreen = lazy(loadPlan);
const SettingsScreen = lazy(loadMore);
const prefetchScreens = () => { void loadNotes(); void loadMoney(); void loadPlan(); void loadMore(); };
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

  // Move focus into the editor (unless it already put the caret somewhere), so keys like End or
  // Space don't scroll the page hidden behind it and screen readers start inside the dialog.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const ed = document.querySelector<HTMLElement>('.editor');
      if (!ed || ed.contains(document.activeElement)) return;
      (ed.querySelector<HTMLElement>('.editor-top [aria-label="Back"]') ?? ed).focus({ preventScroll: true });
    }, 120);
    return () => clearTimeout(t);
  }, [id]);

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
      className={`editor${card.type === 'note' || card.type === 'task' ? ' is-rustic' : ''}`}
      data-color={card.color}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Plain links (#plan, #money…) change the hash too: land at the top of the new screen, like a nav tap.
    let last = readRoute();
    const on = () => {
      const r = readRoute();
      if (r !== last) window.scrollTo(0, 0);
      last = r;
      setRoute(r);
    };
    window.addEventListener('hashchange', on);
    purgeOldTrash().catch(() => {});
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    // Dark by default: the old 'system' setting now means Charcoal.
    const t = !settings?.theme || settings.theme === 'system' ? 'dark' : settings.theme;
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('hisaab.theme', t); } catch { /* storage blocked */ }
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', t === 'light' ? '#F3F5F1' : t === 'oldpage' ? '#221C15' : '#1C1D21');
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
      toastTimer.current = window.setTimeout(() => setToast(null), undo ? 7000 : 3200);
    },
    burst: () => { /* minimal motion: the toast already confirms */ },
    isUnlocked: id => unlocked.current.has(id),
    unlock: id => { unlocked.current.add(id); force(n => n + 1); },
  }), [route]);

  const closeEditor = useCallback(() => setEditor(null), []);

  // Nav taps and the editors' Home button: close whatever is open and land on the screen at once.
  const editorOpen = useRef(false);
  editorOpen.current = !!editor;
  const jump = useCallback((r: Route) => {
    window.dispatchEvent(new Event('hisaab:dismiss')); // sheets, quick search
    if (editorOpen.current) {
      // The editor's own Back flushes unsaved text and drops empty notes.
      const back = document.querySelector<HTMLButtonElement>('.editor .editor-top [aria-label="Back"]');
      if (back) back.click(); else setEditor(null);
    }
    const same = readRoute() === r;
    // Land on the screen's default state: a screen being opened reads the flag as it mounts,
    // the screen already open hears the reset event (clears search/filters, default tab).
    if (same) { clearNavReset(); window.dispatchEvent(new CustomEvent(NAV_RESET, { detail: r })); }
    else { markNavReset(r); location.hash = r; setRoute(r); }
    window.scrollTo({ top: 0, behavior: same && !reduceMotion ? 'smooth' : 'auto' });
  }, [reduceMotion]);
  useEffect(() => {
    const onHome = () => jump('home');
    window.addEventListener('hisaab:home', onHome);
    return () => window.removeEventListener('hisaab:home', onHome);
  }, [jump]);

  // Text shared from WhatsApp/GPay/email, and the home-screen shortcuts (?new=note / ?new=expense).
  const shareDone = useRef(false);
  useEffect(() => {
    if (!settings?.consentAt || shareDone.current) return;
    shareDone.current = true;
    const s = readIncomingShare();
    if (!s) return;
    clearIncomingShare();
    if (s.kind === 'share') {
      const sms = parseBankSms([s.title, s.text].filter(Boolean).join(' '));
      if (sms) {
        try {
          sessionStorage.setItem('hisaab.prefill', JSON.stringify({ amount: sms.amount, category: sms.category, mode: sms.mode, title: sms.merchant, date: sms.date }));
          sessionStorage.setItem('hisaab.quickSpend', '1');
        } catch { /* storage blocked */ }
        location.hash = 'money';
        window.dispatchEvent(new Event('hisaab:spend'));
        return;
      }
      const partial = shareToNote(s);
      if (!partial) return;
      location.hash = 'notes';
      void api.createAndOpen(partial).then(() => api.toast('Saved from share'));
    } else if (s.type === 'note') {
      location.hash = 'notes';
      void api.createAndOpen({ type: 'note' });
    } else if (s.type === 'search') {
      setTimeout(openQuickSearch, 400);
    } else {
      try {
        sessionStorage.setItem('hisaab.quickSpend', '1');
        if (s.type === 'sms') sessionStorage.setItem('hisaab.quickSpend.sms', '1');
      } catch { /* storage blocked */ }
      location.hash = 'money';
      window.dispatchEvent(new Event('hisaab:spend'));
    }
  }, [settings?.consentAt, api]);

  // Must stay above the early returns below (hooks run in the same order every render).
  useEffect(() => (settings?.consentAt ? startReminderLoop() : undefined), [settings?.consentAt]);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const t = w.requestIdleCallback ? w.requestIdleCallback(prefetchScreens) : window.setTimeout(prefetchScreens, 1500);
    return () => { if (!w.requestIdleCallback) clearTimeout(t); };
  }, []);
  if (!settings) return null;
  if (!settings.consentAt) return <AppCtx.Provider value={api}><Onboarding /></AppCtx.Provider>;

  const Screen = { home: HomeScreen, notes: NotesScreen, money: MoneyScreen, plan: PlanScreen, more: SettingsScreen }[route];

  return (
    <AppCtx.Provider value={api}>
      <Ambient life={settings.backgroundLife === true} />
      <div className="shell">
        <nav className="nav" aria-label="Main">
          <div className="brand">Hisaab<span>.</span></div>
          <button type="button" className="nav-search" onClick={openQuickSearch}><Search size={18} aria-hidden="true" /><span>Search</span><kbd>Ctrl K</kbd></button>
          {NAV.map(({ r, label, Icon }) => (
            <a key={r} href={`#${r}`} aria-current={route === r ? 'page' : undefined}
              onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); jump(r); }}>
              <span className="ico">
                <Icon size={22} strokeWidth={2} aria-hidden="true" />
                {route === r && (
                  <motion.span layoutId="nav-dot" className="nav-dot" aria-hidden="true"
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 32 }} />
                )}
              </span>{label}
            </a>
          ))}
        </nav>
        <main className="main" id="main">
          {/* Plain CSS fade: no transform/will-change, so fixed bars and sheets stay fixed to the screen. */}
          <div key={route} className="route-fade">
            <ErrorBoundary resetKey={route}>
              <Suspense fallback={<div className="screen-loading" aria-busy="true" aria-label="Loading" />}>
                <Screen />
              </Suspense>
            </ErrorBoundary>
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
      <QuickSearch />
      <CardPayHost />
    </AppCtx.Provider>
  );
}

// Keep db referenced so dev tools can inspect it.
(window as unknown as { hisaabDb: typeof db }).hisaabDb = db;
