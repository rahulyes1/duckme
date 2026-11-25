import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { Archive } from 'lucide-react';
import { buzz, prefersReducedMotion } from '../../lib/format';

const INTENT = 10; // px of mostly-horizontal travel before a swipe starts

/**
 * Swipe a note left or right to archive it. Vertical scrolling is left to the browser (touch-action: pan-y),
 * a swipe only starts after 10px of clearly horizontal travel, and a tap always reaches the tile.
 * Transform/opacity only.
 */
export function SwipeTile({ children, onArchive, disabled }: {
  children: ReactNode; onArchive: () => void; disabled?: boolean;
}) {
  const mover = useRef<HTMLDivElement>(null);
  const g = useRef({ sx: 0, sy: 0, pid: -1, state: null as null | 'pending' | 'swipe', armed: false, busy: false, dx: 0 });
  const suppressClick = useRef(false);
  const [side, setSide] = useState<'l' | 'r' | null>(null);
  const [armed, setArmed] = useState(false);

  const setX = (x: number, w: number, ms = 0) => {
    const m = mover.current;
    if (!m) return;
    m.style.transition = ms ? `transform ${ms}ms var(--ease-out), opacity ${ms}ms var(--ease-out)` : 'none';
    m.style.transform = x ? `translate3d(${x}px,0,0)` : '';
    m.style.opacity = x ? String(Math.max(0.35, 1 - Math.abs(x) / (w * 1.4))) : '';
  };

  const reset = () => {
    const s = g.current;
    s.state = null; s.pid = -1;
    setX(0, 1, prefersReducedMotion() ? 0 : 220);
    setSide(null); setArmed(false);
  };

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    if (disabled || g.current.busy || e.button > 0 || !e.isPrimary) return;
    Object.assign(g.current, { sx: e.clientX, sy: e.clientY, pid: e.pointerId, state: 'pending', armed: false, dx: 0 });
  };

  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const s = g.current, m = mover.current;
    if (!s.state || e.pointerId !== s.pid || !m) return;
    const dx = e.clientX - s.sx, dy = e.clientY - s.sy;
    if (s.state === 'pending') {
      if (Math.abs(dy) > INTENT && Math.abs(dy) >= Math.abs(dx)) { s.state = null; return; } // a scroll
      if (Math.abs(dx) < INTENT || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      s.state = 'swipe';
      suppressClick.current = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    const w = m.offsetWidth || 160;
    // start from where intent was reached so the card does not jump
    const x = dx - Math.sign(dx) * INTENT;
    s.dx = x;
    setX(x, w);
    const nowArmed = Math.abs(x) > Math.max(70, w * 0.35);
    if (nowArmed !== s.armed) { s.armed = nowArmed; setArmed(nowArmed); if (nowArmed) buzz(8); }
    const sd = x > 0 ? 'r' : 'l';
    setSide(cur => (cur === sd ? cur : sd));
  };

  const up = (e: RPointerEvent<HTMLDivElement>) => {
    const s = g.current, m = mover.current;
    if (e.pointerId !== s.pid) return;
    if (s.state !== 'swipe' || !m) { s.state = null; return; }
    if (!s.armed) { reset(); return; }
    s.busy = true; s.state = null;
    const w = m.offsetWidth || 160;
    const ms = prefersReducedMotion() ? 0 : 200;
    setX(Math.sign(s.dx) * (w + 48), w, ms);
    window.setTimeout(() => {
      onArchive();
      // If the tile is still mounted (e.g. archive failed) put it back.
      window.setTimeout(() => { g.current.busy = false; if (mover.current?.isConnected) reset(); }, 400);
    }, ms);
  };

  const cancel = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== g.current.pid) return;
    if (g.current.state === 'swipe') reset(); else g.current.state = null;
  };

  return (
    <div
      className="notes-swipe"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onClickCapture={e => {
        // only a real swipe eats the click; a tap (or a tiny wobble) always opens the note
        if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; }
      }}
    >
      {side && (
        <div className={`notes-swipe-bg ${side === 'r' ? 'is-r' : 'is-l'} ${armed ? 'is-armed' : ''}`} aria-hidden="true">
          <Archive size={20} />
          <span>{armed ? 'Release to archive' : 'Archive'}</span>
        </div>
      )}
      <div ref={mover} className="notes-swipe-mover">
        {children}
      </div>
    </div>
  );
}
