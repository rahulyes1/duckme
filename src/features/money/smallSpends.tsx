/** Expenses tab: "chai tax" — small payments that add up, plus one-tap "+ again" for the usual ones. */
import { motion } from 'framer-motion';
import { Check, Coffee, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app-context';
import { createCard, withUndo } from '../../lib/actions';
import { buzz, inr, prefersReducedMotion, today, todayISO } from '../../lib/format';
import type { Card } from '../../lib/types';
import { longMonth } from './money-util';
import { catIcon } from './parts';
import { prevMonthKey, SMALL_LIMIT, smallInMonth, topRepeats, type SmallRepeat } from './small';
import './split-review.css';

function AgainButton({ r }: { r: SmallRepeat }) {
  const { toast } = useApp();
  const [done, setDone] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(0), 1400);
    return () => clearTimeout(t);
  }, [done]);
  const Icon = catIcon(r.category);
  const add = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const undo = await withUndo(async () => {
        await createCard({ type: 'expense', title: r.title, amount: r.amount, category: r.category, mode: r.mode, date: todayISO() });
      });
      buzz(15);
      setDone(d => d + 1);
      toast(`Added ${r.title} ${inr(r.amount)} for today`, undo);
    } finally { busy.current = false; }
  };
  const reduce = prefersReducedMotion();
  return (
    <li className="money-sm-again">
      <span className="money-ico" aria-hidden="true"><Icon size={18} /></span>
      <span className="money-mini-text">
        <span className="money-row-title">{r.title}</span>
        <span className="money-sub">{r.count} times · {r.category}</span>
      </span>
      <button type="button" className={`btn money-sm-btn ${done ? 'is-done' : ''}`} onClick={() => void add()}
        aria-label={`Add ${r.title} ${inr(r.amount)} again for today`}>
        {done ? (
          <motion.span key={done} className="money-sm-tick" initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.26, ease: [0.3, 1.5, 0.5, 1] }}>
            <Check size={18} strokeWidth={3} aria-hidden="true" />
          </motion.span>
        ) : <Plus size={16} aria-hidden="true" />}
        <span className="num">{inr(r.amount)}</span>
      </button>
    </li>
  );
}

export function SmallSpendsCard({ cards, month, monthDate }: { cards: Card[]; month: string; monthDate: Date }) {
  const d = useMemo(() => {
    const cur = smallInMonth(cards, month);
    const prev = smallInMonth(cards, prevMonthKey(month));
    const repeats = topRepeats(cards, today());
    return { cur, prev, repeats };
  }, [cards, month]);
  const max = Math.max(d.cur.total, d.prev.total, 1);
  const prevDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
  const { cur, prev } = d;

  return (
    <section className="money-card money-sm" aria-labelledby="e-small">
      <h2 id="e-small" className="money-h"><Coffee size={18} aria-hidden="true" /> Small spends</h2>
      {cur.count ? (
        <p className="money-sm-lead">
          <span className="num"><b>{cur.count}</b> {cur.count === 1 ? 'payment' : 'payments'} under {inr(SMALL_LIMIT)} in {longMonth(monthDate)} = <b>{inr(cur.total)}</b></span>
        </p>
      ) : <p className="money-muted">No payments under {inr(SMALL_LIMIT)} in {longMonth(monthDate)}.</p>}

      {(cur.count > 0 || prev.count > 0) && (
        <ul className="money-sm-vs" aria-label="Small spends compared with last month">
          {[{ label: longMonth(monthDate), v: cur.total, n: cur.count, k: 'cur' }, { label: longMonth(prevDate), v: prev.total, n: prev.count, k: 'prev' }].map(r => (
            <li key={r.k} className={`money-sm-vs-${r.k}`}>
              <div className="money-cat-top">
                <span>{r.label}</span>
                <span className="num"><b>{inr(r.v)}</b> <span className="money-muted">{r.n} paid</span></span>
              </div>
              <div className="money-bar" aria-hidden="true"><i style={{ transform: `scaleX(${r.v / max})` }} /></div>
            </li>
          ))}
        </ul>
      )}

      {cur.top.length > 0 && (
        <div className="money-sm-top">
          <span className="money-k">Where they go</span>
          <ul className="money-sm-cats">
            {cur.top.map(t => {
              const Icon = catIcon(t.name);
              return (
                <li key={t.name}>
                  <Icon size={16} aria-hidden="true" /> {t.name} <span className="num">{inr(t.total)}</span> <span className="money-muted num">· {t.count}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {d.repeats.length > 0 && (
        <div className="money-sm-rep">
          <span className="money-k" id="e-small-again">Add again for today</span>
          <ul className="money-list" aria-labelledby="e-small-again">
            {d.repeats.map(r => <AgainButton key={`${r.title}|${r.amount}`} r={r} />)}
          </ul>
        </div>
      )}
    </section>
  );
}
