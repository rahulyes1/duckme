/**
 * Evening "close the khata": after 8 pm, one card with today's total, the usual spends you haven't logged
 * ("No chai today?" — one tap adds it), and a gentle note if nothing's been written for hours.
 * "Done for today" hides it until tomorrow.
 */
import { useMemo, useState } from 'react';
import { BookCheck, Plus } from 'lucide-react';
import { useApp } from '../../app-context';
import { createCard, withUndo } from '../../lib/actions';
import { inr, todayISO } from '../../lib/format';
import { daySweep } from '../../lib/capture';
import type { Card } from '../../lib/types';

const KEY = 'hisaab.closedDay';
const closedToday = () => { try { return localStorage.getItem(KEY) === todayISO(); } catch { return false; } };

export function CloseDay({ cards, onSpend }: { cards: Card[]; onSpend: () => void }) {
  const { toast } = useApp();
  const [closed, setClosed] = useState(closedToday);
  const now = new Date();
  const s = useMemo(() => daySweep(cards, now), [cards]); // eslint-disable-line react-hooks/exhaustive-deps
  if (closed || now.getHours() < 20) return null;

  const quiet = s.lastAt ? now.getTime() - s.lastAt > 4 * 3600 * 1000 : true;
  const since = s.lastAt ? new Date(s.lastAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : null;
  const add = async (u: { title: string; amount: number; category: string; mode: string }) => {
    const undo = await withUndo(async () => { await createCard({ type: 'expense', title: u.title, amount: u.amount, date: todayISO(), category: u.category, mode: u.mode }); });
    toast(`Added ${u.title} ${inr(u.amount)}`, undo);
  };
  const done = () => { try { localStorage.setItem(KEY, todayISO()); } catch { /* private mode */ } setClosed(true); toast('Khata closed for today'); };

  return (
    <section className="close-day" aria-labelledby="cd-h">
      <h2 id="cd-h"><BookCheck size={18} aria-hidden="true" /> Close today's khata</h2>
      <p className="num">
        {s.count ? <><b>{inr(s.total)}</b> across {s.count} spend{s.count === 1 ? '' : 's'} today.</> : 'Nothing written today.'}
        {quiet && s.count > 0 && since && <> Nothing since {since} — anything missed?</>}
      </p>
      {s.missed.length > 0 && (
        <div className="cd-missed">
          <span>Usually you log:</span>
          {s.missed.slice(0, 3).map(u => (
            <button key={u.title + u.amount} type="button" className="chip" onClick={() => void add(u)}>
              <Plus size={14} aria-hidden="true" /> {u.title} <b className="num">{inr(u.amount)}</b>
            </button>
          ))}
        </div>
      )}
      <div className="cd-actions">
        <button type="button" className="btn" onClick={onSpend}>Write a spend</button>
        <button type="button" className="btn primary" onClick={done}>Done for today</button>
      </div>
    </section>
  );
}
