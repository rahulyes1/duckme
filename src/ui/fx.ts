import { prefersReducedMotion } from '../lib/format';

let canvas: HTMLCanvasElement | null = null;

/** Gold ₹ coins burst up from a rect and fall. Skipped with reduced motion. */
export function coinBurst(rect: DOMRect) {
  if (prefersReducedMotion()) return;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'fx';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
  }
  const W = window.innerWidth, H = window.innerHeight, dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gold = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#E4A70F';
  const ox = rect.left + rect.width / 2, oy = rect.top + rect.height / 2;
  const ps = Array.from({ length: 28 }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3, s = 4 + Math.random() * 7;
    return { x: ox, y: oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 6 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 };
  });
  const t0 = performance.now();
  const frame = (now: number) => {
    const p = (now - t0) / 1100;
    ctx.clearRect(0, 0, W, H);
    for (const q of ps) {
      q.vy += 0.32; q.x += q.vx; q.y += q.vy; q.rot += q.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p * p);
      ctx.translate(q.x, q.y);
      ctx.scale(Math.abs(Math.cos(q.rot)) || 0.05, 1);
      ctx.beginPath(); ctx.arc(0, 0, q.r, 0, Math.PI * 2); ctx.fillStyle = gold; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(120,80,0,.55)'; ctx.stroke();
      ctx.fillStyle = 'rgba(90,60,0,.85)'; ctx.font = `700 ${q.r * 1.15}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('₹', 0, 0.5);
      ctx.restore();
    }
    if (p < 1) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(frame);
}

/** A digit floats up from a keypad key and fades (450ms), then is removed. Skipped with reduced motion. */
export function floatText(rect: DOMRect, text: string) {
  if (prefersReducedMotion() || typeof document === 'undefined') return;
  const s = document.createElement('span');
  s.className = 'fx-float';
  s.setAttribute('aria-hidden', 'true');
  s.textContent = text;
  s.style.left = `${rect.left + rect.width / 2}px`;
  s.style.top = `${rect.top + rect.height / 2}px`;
  document.body.appendChild(s);
  if (typeof s.animate !== 'function') { s.remove(); return; }
  const a = s.animate(
    [{ transform: 'translate(-50%, -50%) translateY(0)', opacity: 1 }, { transform: 'translate(-50%, -50%) translateY(-36px)', opacity: 0 }],
    { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
  );
  a.onfinish = () => s.remove();
  a.oncancel = () => s.remove();
}
