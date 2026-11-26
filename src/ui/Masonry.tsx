import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/** Columns for the space the grid actually has: 2 on phones, then one more per ~200px, max 5. */
export function columnsFor(w: number): number {
  if (w < 560) return 2;
  return Math.max(2, Math.min(5, Math.floor((w + 12) / 212)));
}

/** Count columns from the grid's own width (not the window), so a side panel next to it is respected. */
function useColumns(ref: RefObject<HTMLElement>): number {
  const [n, setN] = useState(() => columnsFor(Math.min(window.innerWidth, 1180)));
  useEffect(() => {
    // Measure the container around the grid: the grid itself may be narrowed on purpose (see `center`).
    const el = ref.current?.parentElement ?? ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setN(columnsFor(w)));
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [ref]);
  return n;
}

/**
 * Keep-style masonry that keeps YOUR order reading left-to-right: item 1 top-left, item 2 next to it, and so on.
 * (CSS columns fill top-to-bottom per column, which would scramble the rank order.)
 */
export function Masonry<T>({ items, keyOf, render, className = '', center = false }: {
  items: T[]; keyOf: (t: T) => string; render: (t: T) => ReactNode; className?: string;
  /** With fewer items than columns, use only as many columns as items and centre them (Notes). */
  center?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const full = useColumns(ref);
  const few = center && items.length > 0 && items.length < full;
  const n = few ? Math.max(2, items.length) : full;
  const cols: T[][] = Array.from({ length: n }, () => []);
  items.forEach((it, i) => cols[i % n].push(it));
  return (
    <div ref={ref} className={`masonry-js ${className}`}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, ...(few ? { maxWidth: n * 230, marginInline: 'auto' } : null) }}>
      {cols.map((col, ci) => (
        <div key={ci} className="masonry-col">
          {col.map(it => <div key={keyOf(it)} className="masonry-item">{render(it)}</div>)}
        </div>
      ))}
    </div>
  );
}
