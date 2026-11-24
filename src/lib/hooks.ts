import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db, DEFAULT_SETTINGS, getSettings } from './db';
import type { Card, Settings } from './types';

/** Live list of all cards (re-renders on any change). Undefined while loading. */
export function useCards(): Card[] | undefined {
  return useLiveQuery(() => db.cards.toArray(), []);
}

export function useCard(id: string | null | undefined): Card | undefined {
  return useLiveQuery(() => (id ? db.cards.get(id) : undefined), [id]);
}

export function useSettings(): Settings {
  return useLiveQuery(() => getSettings(), []) ?? DEFAULT_SETTINGS;
}

/** Text search used by every screen. */
export function matchesQuery(c: Card, q: string): boolean {
  if (!q) return true;
  const hay = [c.title, c.body, c.category, c.labels.join(' '), c.checklist?.map(i => i.text).join(' '), c.invest?.kind]
    .filter(Boolean).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}

/** Animated number for count-ups. Respects reduced motion. */
export function useCountUp(target: number, ms = 650): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = from.current;
    if (reduce || start === target) { setV(target); from.current = target; return; }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(start + (target - start) * e);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, ms]);
  return v;
}

/** Hold-to-act helper (long press). */
export function useLongPress(onLong: () => void, ms = 430) {
  const timer = useRef<number>();
  const fired = useRef(false);
  return {
    fired,
    handlers: {
      onPointerDown: () => { fired.current = false; timer.current = window.setTimeout(() => { fired.current = true; onLong(); }, ms); },
      onPointerUp: () => clearTimeout(timer.current),
      onPointerLeave: () => clearTimeout(timer.current),
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  };
}
