/**
 * Background life: now and then a tiny line-art scene drifts across the khata page behind the app —
 * birds in the morning, a patang (kite) at midday, a balloon in the evening, fireflies at night,
 * and once in a while a paper plane. Purely visual: no scores, nothing to collect.
 *
 * Battery rules: one scene at a time; a single setTimeout while idle; requestAnimationFrame only while a
 * scene is on screen; transform/opacity only, written straight to element styles (no React state per frame).
 * Paused while the tab is hidden or a sheet / editor / search is open. Off with reduced motion.
 * Styles: styles.css ("background life").
 */
import { useEffect, useRef, useState } from 'react';
import { buzz, prefersReducedMotion } from '../lib/format';

const SVG = (w: number, h: number, body: string) =>
  `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">${body}</svg>`;

const BIRD = SVG(28, 14, '<path d="M2 9 Q8 2 14 9 Q20 2 26 9"/>');
const BALLOON = SVG(26, 44, '<ellipse cx="13" cy="12" rx="10" ry="11"/><path d="M11 25 L13 23 L15 25 Z"/><path d="M13 25 q3 3 0 6 q-3 3 0 6 q3 3 0 6"/>');
const KITE = SVG(36, 64,
  '<path d="M18 2 L34 20 L18 40 L2 20 Z"/><path d="M18 2 L18 40 M2 20 L34 20"/>'
  + '<path d="M18 40 q4 5 0 10 q-4 5 0 12"/><path d="M14 47 L18 49 L14 51 M22 55 L18 57 L22 59"/>');
const MOON = SVG(30, 30, '<path d="M19 3 A12 12 0 1 0 27 19 A9 9 0 1 1 19 3 Z"/>');
const PLANE = SVG(32, 24, '<path d="M2 4 L30 12 L2 20 L8 12 Z"/><path d="M8 12 L30 12"/>');

const IGNORE = 'button,a,input,textarea,select,label,[role],.tile,.nav,.sheet,.editor';
const BLOCKERS = '.sheet, .editor, .qs-wrap';
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easeOut = (p: number) => 1 - (1 - p) * (1 - p);
const easeIn = (p: number) => p * p;

interface Box { w: number; h: number; bottom: number }
interface Scene {
  /** Advance by dt seconds (scene time t). Return false when finished. */
  step: (t: number, dt: number) => boolean;
  /** Tap at viewport point; return true if it hit something. */
  hit?: (x: number, y: number) => boolean;
  /** Remove every node the scene added. */
  dispose: () => void;
}

/** Fade 0..1 over `fin` seconds at the start and `fout` seconds at the end of a `life`-second scene. */
const fade = (t: number, life: number, fin = 1.2, fout = 1.2) => clamp(Math.min(t / fin, (life - t) / fout), 0, 1);

function sprite(parent: HTMLElement, html: string, cls = ''): HTMLDivElement {
  const d = document.createElement('div');
  d.className = `life-sp ${cls}`;
  d.innerHTML = html;
  parent.appendChild(d);
  return d;
}

const near = (el: Element, x: number, y: number, pad = 12) => {
  const r = el.getBoundingClientRect();
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
};

function sceneRoot(ink: HTMLElement): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'life-scene';
  root.style.opacity = '0';
  ink.appendChild(root);
  return root;
}

// ---------- scenes ----------

function birds(ink: HTMLElement, box: () => Box): Scene {
  const root = sceneRoot(ink);
  const LIFE = 18;
  const offs = [[0, 0], [-26, -14], [-26, 14], [-52, -28], [-52, 28]];
  const y0 = box().h * rand(0.12, 0.3);
  const flock = offs.map(([dx, dy]) => {
    const el = sprite(root, BIRD, 'life-bird');
    (el.firstElementChild as HTMLElement).classList.add('life-flap');
    (el.firstElementChild as HTMLElement).style.animationDelay = `${-rand(0, 0.6)}s`;
    return { el, dx, dy, flee: -1, fx: 0, fy: 0, gone: false };
  });
  return {
    step(t) {
      const { w } = box();
      const p = t / LIFE;
      const lx = -90 + (w + 180) * p, ly = y0 + Math.sin(t * 0.9) * 6;
      root.style.opacity = String(fade(t, LIFE, 1, 1));
      for (const b of flock) {
        if (b.gone) continue;
        let x = lx + b.dx, y = ly + b.dy;
        if (b.flee >= 0) {
          const q = clamp((t - b.flee) / 0.6, 0, 1);
          x = b.fx + 120 * easeIn(q); y = b.fy - 160 * easeIn(q);
          b.el.style.opacity = String(1 - q);
          if (q >= 1) { b.gone = true; b.el.style.opacity = '0'; }
        }
        b.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
      return t < LIFE;
    },
    hit(x, y) {
      const b = flock.find(f => f.flee < 0 && near(f.el, x, y));
      if (!b) return false;
      // Pin where it was, then let it dart up and away.
      const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(b.el.style.transform);
      b.fx = m ? +m[1] : 0; b.fy = m ? +m[2] : 0;
      b.flee = curT;
      b.el.classList.add('is-fast');
      return true;
    },
    dispose: () => root.remove(),
  };
}

function kite(ink: HTMLElement, box: () => Box): Scene {
  const root = sceneRoot(ink);
  const LIFE = 25;
  const string = document.createElement('div');
  string.className = 'life-string';
  root.appendChild(string);
  const el = sprite(root, KITE);
  (el.firstElementChild as HTMLElement).classList.add('life-sway6');
  const { w, h } = box();
  const x0 = w - 50, x1 = w * rand(0.5, 0.65), y1 = h * rand(0.1, 0.18);
  return {
    step(t) {
      const { w: W, bottom } = box();
      const p = t / LIFE;
      const x = x0 + (x1 - x0) * easeOut(p) + Math.sin(t * 0.5) * 10;
      const y = -70 + (y1 + 70) * easeOut(clamp(p * 3, 0, 1)) + Math.sin(t * 0.7) * 6;
      root.style.opacity = String(fade(t, LIFE));
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      // String from the bridle (centre of the diamond) down to the bottom-right corner.
      const ax = x + 18, ay = y + 20, bx = W - 2, by = bottom;
      const len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
      string.style.transform = `translate3d(${ax}px, ${ay}px, 0) rotate(${ang}rad) scaleX(${len})`;
      return t < LIFE;
    },
    dispose: () => root.remove(),
  };
}

function balloon(ink: HTMLElement, box: () => Box): Scene {
  const root = sceneRoot(ink);
  const LIFE = 30, BW = 26, BH = 44, M = 8;
  const el = sprite(root, BALLOON, 'life-balloon');
  const inner = el.firstElementChild as HTMLElement;
  inner.classList.add('life-sway4');
  const { w, bottom } = box();
  let x = rand(M, Math.max(M, w - BW - M)), y = clamp(bottom - BH - rand(20, 120), M, Math.max(M, bottom - BH - M));
  const a = rand(-Math.PI * 0.85, -Math.PI * 0.15); // mostly upward
  let vx = Math.cos(a) * 22, vy = Math.sin(a) * 22;
  let popped = -1;
  return {
    step(t, dt) {
      if (popped >= 0) return t - popped < 0.32;
      const { w: W, bottom: B } = box();
      x += vx * dt; y += vy * dt;
      if (x < M) { x = M; vx = Math.abs(vx); } else if (x > W - BW - M) { x = W - BW - M; vx = -Math.abs(vx); }
      if (y < M) { y = M; vy = Math.abs(vy); } else if (y > B - BH - M) { y = B - BH - M; vy = -Math.abs(vy); }
      root.style.opacity = String(fade(t, LIFE));
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      return t < LIFE;
    },
    hit(px, py) {
      if (popped >= 0 || !near(inner, px, py)) return false;
      popped = curT;
      buzz(8);
      inner.classList.remove('life-sway4');
      inner.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.25)', opacity: 0 }], { duration: 120, fill: 'forwards' });
      for (let i = 0; i < 6; i++) {
        const s = document.createElement('div');
        s.className = 'life-shard';
        el.appendChild(s);
        const r = `rotate(${i * 60 + 15}deg)`;
        s.animate(
          [{ transform: `${r} translateX(4px)`, opacity: 1 }, { transform: `${r} translateX(22px)`, opacity: 0 }],
          { duration: 250, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
        );
      }
      return true;
    },
    dispose: () => root.remove(),
  };
}

function night(ink: HTMLElement, glow: HTMLElement, box: () => Box): Scene {
  const root = sceneRoot(ink);
  const groot = sceneRoot(glow);
  const LIFE = 20;
  const moon = sprite(root, MOON);
  const { w, h, bottom } = box();
  moon.style.transform = `translate3d(${w - 62}px, 28px, 0)`;
  const flies = Array.from({ length: 8 }, () => {
    const el = document.createElement('div');
    el.className = 'life-sp';
    const dot = document.createElement('div');
    dot.className = 'life-ff';
    dot.style.animationDuration = `${rand(2, 4).toFixed(2)}s`;
    dot.style.animationDelay = `${-rand(0, 4).toFixed(2)}s`;
    el.appendChild(dot);
    groot.appendChild(el);
    return { el, x: rand(16, w - 16), y: rand(h * 0.3, Math.max(h * 0.3 + 1, bottom - 16)), a: rand(0, Math.PI * 2), s: rand(6, 12) };
  });
  return {
    step(t, dt) {
      const { w: W, h: H, bottom: B } = box();
      root.style.opacity = String(fade(t, LIFE, 2));
      groot.style.opacity = String(fade(t, LIFE, 2));
      for (const f of flies) {
        f.a += (Math.random() - 0.5) * dt * 2.4;
        f.x += Math.cos(f.a) * f.s * dt; f.y += Math.sin(f.a) * f.s * dt;
        if (f.x < 10 || f.x > W - 10) { f.a = Math.PI - f.a; f.x = clamp(f.x, 10, W - 10); }
        if (f.y < H * 0.2 || f.y > B - 10) { f.a = -f.a; f.y = clamp(f.y, H * 0.2, B - 10); }
        f.el.style.transform = `translate3d(${f.x}px, ${f.y}px, 0)`;
      }
      return t < LIFE;
    },
    dispose: () => { root.remove(); groot.remove(); },
  };
}

function plane(ink: HTMLElement, box: () => Box): Scene {
  const root = sceneRoot(ink);
  const LIFE = 7;
  const el = sprite(root, PLANE);
  const { w, h } = box();
  const p0 = [-44, h * rand(0.4, 0.55)], p1 = [w * 0.5, h * rand(0.05, 0.15)], p2 = [w + 44, h * rand(0.25, 0.4)];
  return {
    step(t) {
      const p = clamp(t / LIFE, 0, 1), q = 1 - p;
      const x = q * q * p0[0] + 2 * q * p * p1[0] + p * p * p2[0];
      const y = q * q * p0[1] + 2 * q * p * p1[1] + p * p * p2[1];
      const dx = 2 * q * (p1[0] - p0[0]) + 2 * p * (p2[0] - p1[0]);
      const dy = 2 * q * (p1[1] - p0[1]) + 2 * p * (p2[1] - p1[1]);
      root.style.opacity = String(fade(t, LIFE, 0.5, 0.5));
      el.style.transform = `translate3d(${x - 16}px, ${y - 12}px, 0) rotate(${Math.atan2(dy, dx)}rad)`;
      return t < LIFE;
    },
    dispose: () => root.remove(),
  };
}

/** Scene time of the running scene, for hit handlers (they fire between frames). */
let curT = 0;

function pickScene(ink: HTMLElement, glow: HTMLElement, box: () => Box): Scene {
  if (Math.random() < 1 / 8) return plane(ink, box);
  const hr = new Date().getHours();
  if (hr >= 5 && hr < 11) return birds(ink, box);
  if (hr >= 11 && hr < 16) return kite(ink, box);
  if (hr >= 16 && hr < 19) return balloon(ink, box);
  return night(ink, glow, box);
}

/** Runs the scheduler on a .life layer; returns a stop function that clears everything. */
function startLife(layer: HTMLElement): () => void {
  const ink = layer.querySelector<HTMLElement>('.life-ink')!;
  const glow = layer.querySelector<HTMLElement>('.life-glow')!;
  let timer: number | undefined;
  let raf = 0;
  let last = 0;
  let scene: Scene | null = null;
  let due = false; // the idle timer fired while paused
  let blocked = !!document.querySelector(BLOCKERS);
  let dims: Box = { w: 0, h: 0, bottom: 0 };

  const measure = () => {
    const w = layer.clientWidth, h = layer.clientHeight;
    const phone = !matchMedia('(min-width: 1024px)').matches;
    const nav = phone ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64 : 0;
    dims = { w, h, bottom: h - nav - 8 };
  };
  const box = () => dims;
  const paused = () => document.hidden || blocked;

  const schedule = (ms: number) => { clearTimeout(timer); timer = window.setTimeout(fire, ms); };
  const fire = () => {
    timer = undefined;
    if (paused()) { due = true; return; }
    begin();
  };

  const onTap = (e: PointerEvent) => {
    if (!scene?.hit) return;
    const t = e.target as Element | null;
    if (t?.closest?.(IGNORE)) return;
    scene.hit(e.clientX, e.clientY);
  };

  const frame = (now: number) => {
    raf = 0;
    if (!scene) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    curT += dt;
    if (!scene.step(curT, dt)) { finish(); return; }
    raf = requestAnimationFrame(frame);
  };
  const run = () => { if (!raf && scene && !paused()) { last = 0; raf = requestAnimationFrame(frame); } };

  function begin() {
    measure();
    if (dims.w < 40 || dims.h < 40) { schedule(rand(40000, 90000)); return; }
    curT = 0;
    scene = pickScene(ink, glow, box);
    if (scene.hit) document.addEventListener('pointerdown', onTap, { passive: true });
    window.addEventListener('resize', measure);
    scene.step(0, 0);
    run();
  }
  function finish() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener('pointerdown', onTap);
    window.removeEventListener('resize', measure);
    scene?.dispose();
    scene = null;
    schedule(rand(40000, 90000));
  }

  const onPauseChange = () => {
    layer.classList.toggle('is-paused', paused());
    if (paused()) { if (raf) cancelAnimationFrame(raf); raf = 0; return; }
    if (scene) run();
    else if (due) { due = false; schedule(rand(2000, 5000)); }
  };
  const onVis = () => onPauseChange();
  // Sheets and the search portal straight into <body>; the editor is a direct child of #root.
  const mo = new MutationObserver(() => {
    const b = !!document.querySelector(BLOCKERS);
    if (b !== blocked) { blocked = b; onPauseChange(); }
  });
  mo.observe(document.body, { childList: true });
  const root = document.getElementById('root');
  if (root) mo.observe(root, { childList: true });
  document.addEventListener('visibilitychange', onVis);

  schedule(rand(8000, 15000));
  layer.classList.toggle('is-paused', paused());

  return () => {
    clearTimeout(timer);
    if (raf) cancelAnimationFrame(raf);
    mo.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('pointerdown', onTap);
    window.removeEventListener('resize', measure);
    scene?.dispose();
    scene = null;
  };
}

export function AmbientLife() {
  const ref = useRef<HTMLDivElement>(null);
  const [reduce, setReduce] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  useEffect(() => {
    if (reduce || !ref.current) return;
    return startLife(ref.current);
  }, [reduce]);

  if (reduce) return null;
  return (
    <div className="life" aria-hidden="true" ref={ref}>
      <div className="life-ink" />
      <div className="life-glow" />
    </div>
  );
}
