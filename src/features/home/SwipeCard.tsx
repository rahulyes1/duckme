import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Archive, CalendarClock, Check, X } from 'lucide-react';
import type { Card, Settings } from '../../lib/types';
import { CardTile } from '../../ui/CardTile';
import { useApp } from '../../app-context';
import { delay, kill, markDone, payBill } from '../../lib/actions';
import { buzz, fmtDate, inr, prefersReducedMotion, salarySide } from '../../lib/format';

type Zone = 'right' | 'delay' | 'kill' | null;
type Dir = 'r' | 'l';

interface Props {
  card: Card;
  settings: Settings;
  /** Locked note not unlocked yet: shows the locked tile and disables swiping. */
  hidden?: boolean;
  /** Freshly added: scale-spring pop in. */
  isNew?: boolean;
  /** Called after any completed swipe action (used to retire the hint). */
  onSwiped?: () => void;
}

const T = (ms: number) => (prefersReducedMotion() ? 0 : ms);

/**
 * CardTile with swipe actions (ported from the mockup):
 * right = Paid / Done / Archive, short left = Delay (1 week or 1 day, from Settings) (only with a date), long left (>80%) = Kill.
 * Tap (no swipe) opens the editor; Enter on the focused tile also opens it.
 */
export function SwipeCard({ card, settings, hidden, isNew, onSwiped }: Props) {
  const app = useApp();
  const wrap = useRef<HTMLDivElement>(null);
  const mover = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLDivElement>(null);
  const g = useRef({ sx: 0, sy: 0, pid: -1, state: null as null | 'pending' | 'swipe', zone: null as Zone, dir: 'r' as Dir, busy: false });
  const suppress = useRef(false);
  const [vis, setVis] = useState<{ dir: Dir; zone: Zone }>({ dir: 'r', zone: null });

  const hasDue = !!(card.due || card.invest?.next);
  // A paid repeating bill becomes a NEW card (spec §5), so only repeating tasks stay in place.
  const repeats = card.type === 'task' && !!card.due && !!card.repeat && card.repeat !== 'none';
  const delayText = settings.delayDays === 1 ? '1 day' : '1 week';
  const rightLabel = card.type === 'bill' ? 'Paid' : card.type === 'task' ? 'Done' : 'Archive';

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (hidden || g.current.busy || e.button > 0) return;
    const s = g.current;
    s.sx = e.clientX; s.sy = e.clientY; s.pid = e.pointerId; s.state = 'pending'; s.zone = null;
    if (mover.current) mover.current.style.transition = 'none';
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const s = g.current, m = mover.current, t = trail.current;
    if (!s.state || e.pointerId !== s.pid || !m || !t) return;
    const mx = e.clientX - s.sx, my = e.clientY - s.sy;
    if (s.state === 'pending') {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my) * 1.2) {
        s.state = 'swipe';
        try { m.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      } else if (Math.abs(my) > 8) { s.state = null; return; }
      else return;
    }
    m.style.transform = `translateX(${mx}px) rotate(${mx / 45}deg)`;
    const w = m.offsetWidth;
    const nz: Zone = mx > w * 0.42 ? 'right' : mx < -w * 0.8 ? 'kill' : (mx < -w * 0.42 && hasDue) ? 'delay' : null;
    const dir: Dir = mx > 0 ? 'r' : 'l';
    t.style.opacity = String(Math.min(1, Math.abs(mx) / 50));
    if (nz !== s.zone || dir !== s.dir) {
      if (nz && nz !== s.zone) buzz(10);
      s.zone = nz; s.dir = dir;
      setVis({ dir, zone: nz });
    }
  };

  const snapBack = () => {
    const m = mover.current, t = trail.current;
    if (!m || !t) return;
    m.style.transition = `transform ${T(420)}ms var(--spring)`;
    m.style.transform = '';
    t.style.transition = `opacity ${T(250)}ms`;
    t.style.opacity = '0';
    window.setTimeout(() => { if (t) t.style.transition = ''; }, 300);
  };

  const restore = () => {
    const w = wrap.current, m = mover.current;
    if (w) { w.getAnimations().forEach(a => a.cancel()); w.style.overflow = ''; }
    if (m) { m.style.transition = ''; m.style.transform = ''; m.style.opacity = ''; }
    if (trail.current) trail.current.style.opacity = '0';
    g.current.busy = false;
  };

  /** Fly the card off-screen, collapse its slot, then run the action. */
  const flyOut = (dir: 1 | -1, then: () => Promise<void>) => {
    const m = mover.current, w = wrap.current, t = trail.current;
    if (!m || !w) { void then(); return; }
    g.current.busy = true;
    m.style.transition = `transform ${T(220)}ms var(--ease-in), opacity ${T(220)}ms`;
    m.style.transform = `translateX(${dir * 130}%) rotate(${dir * 12}deg)`;
    m.style.opacity = '0';
    if (t) { t.style.transition = `opacity ${T(220)}ms`; t.style.opacity = '0'; }
    const run = () => { then().catch(restore); };
    window.setTimeout(() => {
      if (prefersReducedMotion()) { run(); return; }
      const h = w.offsetHeight;
      w.style.overflow = 'hidden';
      const a = w.animate(
        [{ height: `${h}px`, marginBottom: '10px', opacity: 1 }, { height: '0px', marginBottom: '0px', opacity: 0 }],
        { duration: 240, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
      );
      a.onfinish = run;
    }, T(200));
  };

  const doRight = async (rect: DOMRect) => {
    if (card.type === 'bill') {
      app.burst(rect);
      buzz([12, 40, 12]);
      const { undo, nextDue } = await payBill(card.id);
      app.toast(`Paid ${inr(card.amount)}. Logged as an expense.${nextDue ? ` Next bill due ${fmtDate(nextDue)}.` : ''}`, undo);
    } else {
      const undo = await markDone(card.id);
      if (card.type === 'task') buzz(15);
      app.toast(card.type === 'task' ? (repeats ? 'Done. Next one is on the list.' : 'Done. Nice.') : 'Archived.', undo);
    }
    onSwiped?.();
  };

  const doKill = async () => {
    const undo = await kill(card.id);
    app.toast(`Killed “${card.title || 'Untitled'}”.`, undo);
    onSwiped?.();
  };

  const doDelay = async () => {
    const { undo, newDate } = await delay(card.id, settings.delayDays);
    const side = card.type === 'bill' && newDate ? ` · ${salarySide(newDate, settings.salaryDay)} salary` : '';
    app.toast(newDate ? `Moved to ${fmtDate(newDate)}${side}.` : `Delayed ${delayText}.`, undo);
    onSwiped?.();
    if (!prefersReducedMotion()) {
      mover.current?.animate(
        [{ transform: 'translateX(-14px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'none' }],
        { duration: 380 },
      );
    }
  };

  const resolve = () => {
    const z = g.current.zone;
    g.current.zone = null;
    if (z === 'right') {
      const rect = (mover.current ?? wrap.current!).getBoundingClientRect();
      if (repeats) { snapBack(); void doRight(rect); }
      else flyOut(1, () => doRight(rect));
    } else if (z === 'kill') {
      flyOut(-1, doKill);
    } else if (z === 'delay') {
      snapBack();
      window.setTimeout(() => { void doDelay(); }, T(250));
    } else snapBack();
  };

  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (e.pointerId !== s.pid) return;
    if (s.state === 'swipe') {
      suppress.current = true;
      window.setTimeout(() => { suppress.current = false; }, 60);
      resolve();
    }
    s.state = null;
  };

  const onPointerCancel = () => {
    const s = g.current;
    if (s.state === 'swipe') { s.zone = null; snapBack(); }
    s.state = null;
  };

  const RightIcon = card.type === 'bill' || card.type === 'task' ? Check : Archive;
  const Icon = vis.dir === 'r' ? RightIcon : vis.zone === 'kill' ? X : CalendarClock;
  const label = vis.dir === 'r' ? rightLabel : vis.zone === 'kill' ? 'Kill' : hasDue ? `Delay ${delayText}` : 'Keep going to kill';

  return (
    <div ref={wrap} className={`home-sw ${isNew ? 'home-newpop' : ''}`} data-id={card.id}>
      <div ref={trail} className={`home-trail is-${vis.dir} ${vis.zone === 'kill' ? 'is-kill' : ''}`} aria-hidden="true">
        <span className={`home-trail-ic ${vis.zone ? 'is-armed' : ''}`}>
          <Icon size={20} strokeWidth={2.6} />
          {label}
        </span>
      </div>
      <div
        ref={mover}
        className="home-sw-card"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <CardTile
          card={card}
          settings={settings}
          hidden={hidden}
          onOpen={el => { if (!suppress.current && !g.current.busy) app.openCard(card.id, el); }}
        />
      </div>
    </div>
  );
}
