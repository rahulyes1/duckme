import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, ChevronRight, History } from 'lucide-react';
import { useApp } from '../../app-context';
import type { Card } from '../../lib/types';
import { fmtDate, todayISO } from '../../lib/format';
import { journalFor, journalPreview, weekOf, weekdayName, weekdayShort } from './journal';
import { ensureJournal } from './journal-store';
import { useCards } from '../../lib/hooks';
import { resurface } from './resurface';

/**
 * The Today page entry at the top of Notes: today's date and weekday, a one-line preview,
 * and a Mon–Sun strip (filled dot = wrote that day). Tapping opens (or creates) that day's journal.
 */
export function TodayBanner({ cards }: { cards: Card[] }) {
  const app = useApp();
  const today = todayISO();
  const entry = journalFor(cards, today);
  const week = weekOf(today);
  const [busy, setBusy] = useState(false);
  // "Last time" lines look at every card (bills and expenses too), not just the notes pool.
  const all = useCards();
  const lines = useMemo(() => (all ? resurface(all, today) : []), [all, today]);

  const openDay = async (iso: string, el: HTMLElement) => {
    if (busy) return;
    setBusy(true);
    try {
      const c = await ensureJournal(iso);
      app.openCard(c.id, el);
    } catch {
      app.toast('Could not open the journal. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const preview = journalPreview(entry);
  return (
    <motion.section
      className="notes-today"
      aria-label="Today page"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <button type="button" className="notes-today-main" onClick={e => openDay(today, e.currentTarget)} aria-busy={busy}>
        <span className="notes-today-ico" aria-hidden="true"><BookOpen size={22} /></span>
        <span className="notes-today-text">
          <span className="notes-today-k">Today · {weekdayName(today)}</span>
          <span className="notes-today-date num">{fmtDate(today)}</span>
          <span className="notes-today-p">{preview || (entry ? 'Open today’s page' : 'Write today’s page. Unticked items from your last page come along.')}</span>
        </span>
        <ChevronRight size={20} aria-hidden="true" className="notes-today-go" />
      </button>
      <div className="notes-week" role="group" aria-label="This week’s pages">
        {week.map(iso => {
          const has = !!journalFor(cards, iso);
          const future = iso > today;
          const isToday = iso === today;
          return (
            <button
              key={iso}
              type="button"
              className={`notes-day ${isToday ? 'is-today' : ''} ${has ? 'has' : ''}`}
              disabled={future}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${weekdayName(iso)} ${fmtDate(iso)}${has ? ', has a page' : future ? ', not yet' : ', no page'}`}
              onClick={e => openDay(iso, e.currentTarget)}
            >
              <span className="notes-day-w" aria-hidden="true">{weekdayShort(iso).slice(0, 2)}</span>
              <span className="notes-day-dot" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {lines.length > 0 && (
        <ul className="notes-resurface" aria-label="Last time">
          {lines.map(l => (
            <li key={`${l.kind}-${l.cardId}`}>
              <button type="button" className="notes-resurface-row" onClick={e => app.openCard(l.cardId, e.currentTarget)}>
                <History size={16} aria-hidden="true" className="notes-resurface-ico" />
                <span className="notes-resurface-t"><b>{l.lead}:</b> <span className="num">{l.text}</span></span>
                <ChevronRight size={16} aria-hidden="true" className="notes-resurface-go" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
