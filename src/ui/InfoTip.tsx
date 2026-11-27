/** A small (i) button that reveals one short explanation on tap. Keeps screens numbers-first. */
import { Info } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './infotip.css';

export function InfoTip({ label = 'More info', children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { const t = e.target as Node; if (!wrap.current?.contains(t) && !document.getElementById(id)?.contains(t)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, { passive: true });
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey, true); window.removeEventListener('scroll', close); };
  }, [open, id]);
  return (
    <span className="infotip" ref={wrap}>
      <button type="button" className="infotip-btn" aria-label={label} aria-expanded={open} aria-controls={id}
        onClick={e => {
          e.stopPropagation();
          // Fixed position, clamped to the screen, so it never spills off the edge.
          const r = e.currentTarget.getBoundingClientRect(), w = Math.min(260, window.innerWidth - 24);
          setPos({ top: r.bottom + 6, left: Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12)) });
          setOpen(o => !o);
        }}>
        <Info size={16} aria-hidden="true" />
      </button>
      {/* Portal: a transformed (animated) parent would otherwise trap position: fixed. */}
      {open && createPortal(<span id={id} role="note" className="infotip-pop" style={pos}>{children}</span>, document.body)}
    </span>
  );
}
