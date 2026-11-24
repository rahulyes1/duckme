import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import type { Card, Settings } from '../../lib/types';
import { useApp } from '../../app-context';
import { useCountUp } from '../../lib/hooks';
import { buzz, fmtDate, inr } from '../../lib/format';
import { buildBuckets, buildEvents, LEVELS, type Bucket, type Level, type TEvent } from './timeline-model';

const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

/** "₹X going out" that counts up from zero when the bucket appears. */
function GoingOut({ value }: { value: number }) {
  const [target, setTarget] = useState(0);
  useEffect(() => { setTarget(value); }, [value]);
  const v = useCountUp(target, 600);
  return <><b className="num" aria-hidden="true">{inr(v)}</b><span className="sr-only">{inr(value)}</span><span>going out</span></>;
}

interface Row { bucket: Bucket; items: TEvent[]; outTotal: number }

export function Timeline({ cards, settings }: { cards: Card[]; settings: Settings }) {
  const app = useApp();
  const reduce = useReducedMotion();
  const [level, setLevel] = useState<Level>(0);
  const [dir, setDir] = useState(1);
  const levelRef = useRef<Level>(0);
  const lastZoom = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  const zoomTo = useCallback((n: number, gesture = false) => {
    const next = Math.max(0, Math.min(3, n)) as Level;
    const cur = levelRef.current;
    if (next === cur) return;
    const now = performance.now();
    if (gesture && now - lastZoom.current < 320) return;
    lastZoom.current = now;
    levelRef.current = next;
    setDir(next > cur ? 1 : -1);
    setLevel(next);
    buzz(6);
  }, []);

  // ctrl+wheel and two-finger pinch (non-passive listeners so we can stop the browser zoom)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let wheelAcc = 0, pinch0 = 0;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      wheelAcc += e.deltaY;
      if (wheelAcc > 40) { zoomTo(levelRef.current + 1, true); wheelAcc = 0; }
      else if (wheelAcc < -40) { zoomTo(levelRef.current - 1, true); wheelAcc = 0; }
    };
    const onStart = (e: TouchEvent) => { if (e.touches.length === 2) pinch0 = dist(e.touches); };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch0) return;
      e.preventDefault();
      const r = dist(e.touches) / pinch0;
      if (r > 1.35) { zoomTo(levelRef.current - 1, true); pinch0 = dist(e.touches); }
      else if (r < 0.72) { zoomTo(levelRef.current + 1, true); pinch0 = dist(e.touches); }
    };
    const onEnd = () => { pinch0 = 0; };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [zoomTo]);

  const events = useMemo(() => buildEvents(cards), [cards]);
  const rows: Row[] = useMemo(() => buildBuckets(level, settings.salaryDay).map(bucket => {
    const items = events.filter(x => x.date >= bucket.start && x.date < bucket.end);
    return { bucket, items, outTotal: items.reduce((s, x) => s + (x.out ? x.amount : 0), 0) };
  }), [events, level, settings.salaryDay]);

  const levelV: Variants = {
    enter: (d: number) => ({ opacity: 0, scale: reduce ? 1 : d > 0 ? 1.12 : 0.88 }),
    center: { opacity: 1, scale: 1, transition: { duration: reduce ? 0.01 : 0.28, ease: EASE_OUT, staggerChildren: reduce ? 0 : 0.03 } },
    exit: (d: number) => ({ opacity: 0, scale: reduce ? 1 : d > 0 ? 0.82 : 1.18, transition: { duration: reduce ? 0.01 : 0.18, ease: [0.4, 0, 1, 1] } }),
  };
  const rowV: Variants = {
    enter: reduce ? { opacity: 0 } : { opacity: 0, y: 8 },
    center: { opacity: 1, y: 0, transition: { duration: reduce ? 0.01 : 0.26, ease: EASE_OUT } },
    exit: {},
  };

  const maxPills = level >= 2 ? 5 : 4;

  return (
    <section aria-label="Timeline">
      <div className="plan-tlbar">
        <div className="plan-seg" role="group" aria-label="Zoom level">
          {LEVELS.map((l, i) => (
            <button key={l} type="button" aria-pressed={level === i} onClick={() => zoomTo(i)}>{l}</button>
          ))}
        </div>
        <div className="plan-zoombtns">
          <button type="button" className="plan-zbtn" aria-label="Zoom out, show a longer range" disabled={level === 3} onClick={() => zoomTo(level + 1)}>
            <Minus size={20} aria-hidden="true" />
          </button>
          <button type="button" className="plan-zbtn" aria-label="Zoom in, show a shorter range" disabled={level === 0} onClick={() => zoomTo(level - 1)}>
            <Plus size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="plan-tlhint">Pinch or ctrl+scroll to zoom. Tap any item to open it.</p>

      <div className="plan-tl" ref={box}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={level} className="plan-tl-inner" custom={dir} variants={levelV} initial="enter" animate="center" exit="exit">
            {rows.flatMap(({ bucket: b, items, outTotal }) => {
              const marker = level === 0 && b.salary
                ? <motion.div key={`${b.key}-sal`} variants={rowV} className="plan-salmark" role="separator">Salary credit · {fmtDate(b.salary)}</motion.div>
                : null;
              if (!items.length && level === 0) {
                return [marker, (
                  <motion.div key={b.key} variants={rowV} className={`plan-bucket is-empty ${b.today ? 'is-today' : ''}`}>
                    <div className="plan-bl"><b>{b.label}</b></div>
                    <div className="plan-bl"><small>{b.sub}</small></div>
                  </motion.div>
                )];
              }
              const shown = items.slice(0, maxPills);
              return [marker, (
                <motion.div key={b.key} variants={rowV} className={`plan-bucket ${b.today ? 'is-today' : ''}`}>
                  <div className="plan-bl"><b>{b.label}</b><small>{b.sub}</small></div>
                  <div className="plan-bc">
                    <div className="plan-bt">
                      {outTotal > 0
                        ? <GoingOut value={outTotal} />
                        : <span>{items.length ? `${items.length} item${items.length > 1 ? 's' : ''}` : 'Nothing due'}</span>}
                      {level > 0 && level < 3 && b.salary && <span className="plan-saltag">Salary · {fmtDate(b.salary)}</span>}
                    </div>
                    {shown.length > 0 && (
                      <div className="plan-tpills">
                        {shown.map(x => (
                          <button
                            key={x.key}
                            type="button"
                            className={`plan-tp ${x.late ? 'is-late' : ''}`}
                            data-color={x.card.color}
                            aria-label={`${x.label}${x.amount ? `, ${inr(x.amount)}` : ''}, ${x.late ? 'overdue' : fmtDate(x.date)}`}
                            onClick={e => app.openCard(x.card.id, e.currentTarget)}
                          >
                            <span>{x.label}</span>
                            {x.late ? <em>Overdue</em> : x.amount ? <em>{inr(x.amount)}</em> : level === 0 ? null : <em>{fmtDate(x.date)}</em>}
                          </button>
                        ))}
                        {items.length > shown.length && <span className="pill">+{items.length - shown.length} more</span>}
                      </div>
                    )}
                  </div>
                </motion.div>
              )];
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
