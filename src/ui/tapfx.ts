/**
 * Tap squish: after a button is released it gives a tiny squash-and-spring (scale 1 -> .94 -> 1).
 * Runs on click (after release), so the "press feedback must not change size" rule in styles.css still holds:
 * nothing shrinks while the finger is down. Uses the `scale` property so a control's own transform is untouched.
 * Off with reduced motion (and follows the setting if it changes while the app is open).
 */
import { prefersReducedMotion } from '../lib/format';

const TARGETS = '.btn, .chip, .icon-btn, .money-qe-key, .set-seg-btn, .switch, .tp-check, .plan-pcheck';
const SKIP = '.home-sw-card';

export function startTapFx(): () => void {
  let off = prefersReducedMotion();
  const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const onMq = () => { off = prefersReducedMotion(); };
  mq?.addEventListener?.('change', onMq);

  const onClick = (e: MouseEvent) => {
    if (off) return;
    const t = e.target as Element | null;
    const el = t?.closest?.(TARGETS) as HTMLElement | null;
    if (!el || el.closest(SKIP) || el.matches(':disabled, [aria-disabled="true"]') || typeof el.animate !== 'function') return;
    el.animate(
      [{ scale: '1' }, { scale: '.94', offset: 0.35 }, { scale: '1' }],
      { duration: 220, easing: 'cubic-bezier(.3,1.5,.5,1)' },
    );
  };
  document.addEventListener('click', onClick, { passive: true });
  return () => {
    document.removeEventListener('click', onClick);
    mq?.removeEventListener?.('change', onMq);
  };
}
