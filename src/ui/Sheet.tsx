import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Hide the visible heading (still labelled for screen readers). */
  hideTitle?: boolean;
  children: ReactNode;
}

/** Bottom sheet on phones, centred dialog on wide screens. Escape closes, focus moves in and back. */
export function Sheet({ open, onClose, title, hideTitle, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const dragControls = useDragControls();

  // Keep the latest onClose in a ref: the effect below must run ONLY when the sheet opens/closes.
  // (Depending on onClose re-ran it on every parent render, which yanked focus out of the field
  // you were typing in — the "forms are buggy" bug.)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const touch = matchMedia('(pointer: coarse)').matches;
    const t = setTimeout(() => {
      const root = ref.current;
      if (!root) return;
      // On phones, don't pop the keyboard open by focusing a text field; only honour an explicit autofocus.
      const auto = root.querySelector<HTMLElement>('[data-autofocus], [autofocus]');
      const first = auto ?? (touch ? null : root.querySelector<HTMLElement>('input:not([readonly]), textarea, select, button:not(.sheet-close)'));
      (first ?? root).focus({ preventScroll: true });
    }, 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); }
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])')].filter(el => !el.hasAttribute('disabled'));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    // When the phone keyboard opens, keep the focused field visible inside the sheet.
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!touch || !ref.current?.contains(el) || !el.matches('input, textarea, select')) return;
      setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
    };
    // Stop the page behind from scrolling while the sheet is open.
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      clearTimeout(t);
      html.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn);
      (opener.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, [open]);

  const wide = typeof window !== 'undefined' && window.innerWidth >= 720;
  // Portal to <body>: a parent with transform/will-change would otherwise turn position:fixed into
  // "fixed to that parent", pushing the sheet off-screen on long pages.
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.16 } }} />
          <motion.div
            ref={ref}
            className="sheet"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-label={title}
            initial={wide ? { opacity: 0, scale: 0.96, x: '-50%' } : { y: '100%' }}
            animate={wide ? { opacity: 1, scale: 1, x: '-50%' } : { y: 0 }}
            exit={wide ? { opacity: 0, scale: 0.97, x: '-50%', transition: { duration: 0.15 } } : { y: '100%', transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
            transition={wide ? { type: 'spring', stiffness: 420, damping: 38 } : { type: 'spring', stiffness: 380, damping: 30 }}
            drag={wide ? false : 'y'}
            // Drag-to-close starts ONLY from the grab bar. Before, any finger wobble on a button inside
            // the sheet started a drag and swallowed the tap (the "switches don't work" bug).
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 600) onClose(); }}
          >
            <div className="grab-zone" aria-hidden="true" onPointerDown={e => dragControls.start(e)}><div className="grab" /></div>
            {hideTitle ? <h2 className="sr-only">{title}</h2> : <h2>{title}</h2>}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
