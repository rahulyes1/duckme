import { useEffect, useState, type ReactNode } from 'react';

/** Column count by viewport width (same breakpoints as the old CSS columns). */
function columnsFor(w: number): number {
  if (w >= 1280) return 5;
  if (w >= 960) return 4;
  if (w >= 640) return 3;
  return 2;
}

function useColumns(): number {
  const [n, setN] = useState(() => columnsFor(window.innerWidth));
  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setN(columnsFor(window.innerWidth))); };
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, []);
  return n;
}

/**
 * Keep-style masonry that keeps YOUR order reading left-to-right: item 1 top-left, item 2 next to it, and so on.
 * (CSS columns fill top-to-bottom per column, which would scramble the rank order.)
 */
export function Masonry<T>({ items, keyOf, render, className = '' }: {
  items: T[]; keyOf: (t: T) => string; render: (t: T) => ReactNode; className?: string;
}) {
  const n = useColumns();
  const cols: T[][] = Array.from({ length: n }, () => []);
  items.forEach((it, i) => cols[i % n].push(it));
  return (
    <div className={`masonry-js ${className}`} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      {cols.map((col, ci) => (
        <div key={ci} className="masonry-col">
          {col.map(it => <div key={keyOf(it)} className="masonry-item">{render(it)}</div>)}
        </div>
      ))}
    </div>
  );
}
