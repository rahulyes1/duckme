/**
 * One box for everything: find any note, task, bill, spend or investment, or run an action.
 * Opens with Ctrl/⌘+K or "/" (desktop), the sidebar Search button, or the search button on Money / Priorities.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ClipboardPaste, CornerDownLeft, Search, type LucideIcon } from 'lucide-react';
import { useApp, type Route } from '../app-context';
import { matchesQuery, useCards } from '../lib/hooks';
import { fmtDate, inr, prefersReducedMotion } from '../lib/format';
import { isActive, KIND_LABEL, type Card } from '../lib/types';
import { TYPE_ICON } from './CardTile';

export const openQuickSearch = () => window.dispatchEvent(new Event('hisaab:search'));

interface Action { id: string; label: string; hint: string; Icon: LucideIcon; run: () => void; words: string }

function subline(c: Card): string {
  const bits: string[] = [KIND_LABEL[c.type]];
  if (c.amount && (c.type === 'expense' || c.type === 'bill' || c.type === 'invest')) bits.push(inr(c.amount));
  if (c.type === 'bill' && c.due) bits.push(`due ${fmtDate(c.due)}`);
  if (c.type === 'expense' && c.date) bits.push(fmtDate(c.date));
  if (c.category && c.type === 'expense') bits.push(c.category);
  return bits.join(' · ');
}

export function QuickSearch() {
  const app = useApp();
  const cards = useCards();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const show = () => { opener.current = document.activeElement; setQ(''); setSel(0); setOpen(true); };
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(input|textarea|select)$/i.test((e.target as HTMLElement)?.tagName ?? '') || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); show(); }
      else if (e.key === '/' && !typing && !document.querySelector('.sheet, .editor')) { e.preventDefault(); show(); }
    };
    const hide = () => setOpen(false);
    window.addEventListener('hisaab:search', show);
    window.addEventListener('hisaab:dismiss', hide);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('hisaab:search', show); window.removeEventListener('hisaab:dismiss', hide); window.removeEventListener('keydown', onKey); };
  }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 30); }, [open]);

  const close = () => { setOpen(false); (opener.current as HTMLElement | null)?.focus?.(); };
  const goSpend = (extra?: string) => { if (extra) sessionStorage.setItem(extra, '1'); sessionStorage.setItem('hisaab.quickSpend', '1'); app.go('money'); };
  const go = (r: Route) => () => app.go(r);

  const actions: Action[] = useMemo(() => [
    { id: 'spend', label: 'Add spend', hint: 'Number pad', Icon: TYPE_ICON.expense, run: () => goSpend(), words: 'add spend expense money kharcha' },
    { id: 'sms', label: 'Paste bank SMS', hint: 'Fill a spend from a message', Icon: ClipboardPaste, run: () => goSpend('hisaab.quickSpend.sms'), words: 'paste sms bank upi message' },
    { id: 'note', label: 'New note', hint: 'Blank note', Icon: TYPE_ICON.note, run: () => { void app.createAndOpen({ type: 'note' }); }, words: 'new note write' },
    { id: 'task', label: 'New task', hint: 'With a date', Icon: TYPE_ICON.task, run: () => { void app.createAndOpen({ type: 'task', color: 'sand' }); }, words: 'new task todo priority' },
    { id: 'bill', label: 'New bill', hint: 'Rent, card, EMI', Icon: TYPE_ICON.bill, run: () => { void app.createAndOpen({ type: 'bill', repeat: 'monthly' }); }, words: 'new bill rent emi due' },
    { id: 'home', label: 'Go to Home', hint: '', Icon: ArrowRight, run: go('home'), words: 'go home today' },
    { id: 'notes', label: 'Go to Notes', hint: '', Icon: ArrowRight, run: go('notes'), words: 'go notes journal' },
    { id: 'money', label: 'Go to Money', hint: '', Icon: ArrowRight, run: go('money'), words: 'go money budget bills goals udhaar' },
    { id: 'plan', label: 'Go to Priorities', hint: '', Icon: ArrowRight, run: go('plan'), words: 'go priorities plan week month' },
    { id: 'more', label: 'Go to More', hint: 'Settings, reminders, backup', Icon: ArrowRight, run: go('more'), words: 'go more settings reminders theme backup export' },
  ], [app]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = q.trim();
  const acts = actions.filter(a => !query || query.toLowerCase().split(/\s+/).every(w => a.words.includes(w) || a.label.toLowerCase().includes(w))).slice(0, query ? 4 : 5);
  const found = useMemo(() => {
    if (!query) return [];
    const list = (cards ?? []).filter(c => c.status !== 'trashed' && !(c.locked && !app.isUnlocked(c.id)) && matchesQuery(c, query));
    return list.sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || b.updatedAt - a.updatedAt).slice(0, 8);
  }, [cards, query, app]);

  type Row = { key: string; run: () => void };
  const rows: Row[] = [...found.map(c => ({ key: c.id, run: () => app.openCard(c.id) })), ...acts.map(a => ({ key: a.id, run: a.run }))];
  const pick = (i: number) => { const r = rows[i]; if (!r) return; setOpen(false); r.run(); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(rows.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
  };
  const fast = prefersReducedMotion();

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="qs-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
          <motion.div className="qs" role="dialog" aria-modal="true" aria-label="Search everything"
            initial={fast ? false : { y: -12, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={fast ? undefined : { y: -8, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }} onKeyDown={onKeyDown}>
            <label className="qs-in">
              <Search size={20} aria-hidden="true" />
              <span className="sr-only">Search notes, bills, spends, or type a command</span>
              <input ref={input} value={q} onChange={e => { setQ(e.target.value); setSel(0); }} placeholder="Search everything, or type “spend”…"
                role="combobox" aria-expanded="true" aria-controls="qs-list" aria-activedescendant={rows[sel] ? `qs-${rows[sel].key}` : undefined} autoComplete="off" />
              <kbd className="qs-kbd">Esc</kbd>
            </label>
            <ul id="qs-list" className="qs-list" role="listbox">
              {found.length > 0 && <li className="qs-sec" role="presentation">Cards</li>}
              {found.map((c, i) => {
                const Icon = TYPE_ICON[c.type];
                return (
                  <li key={c.id} id={`qs-${c.id}`} role="option" aria-selected={sel === i} className="qs-row" onMouseEnter={() => setSel(i)} onClick={() => pick(i)}>
                    <span className="qs-ic" data-t={c.type}><Icon size={16} aria-hidden="true" /></span>
                    <span className="qs-txt"><b>{c.title || `Untitled ${KIND_LABEL[c.type].toLowerCase()}`}</b><small>{subline(c)}{!isActive(c) ? ' · done' : ''}</small></span>
                    {sel === i && <CornerDownLeft size={14} aria-hidden="true" className="qs-enter" />}
                  </li>
                );
              })}
              {query && !found.length && <li className="qs-empty" role="presentation">No cards match “{query}”.</li>}
              {acts.length > 0 && <li className="qs-sec" role="presentation">{query ? 'Actions' : 'Quick actions'}</li>}
              {acts.map((a, j) => {
                const i = found.length + j;
                return (
                  <li key={a.id} id={`qs-${a.id}`} role="option" aria-selected={sel === i} className="qs-row" onMouseEnter={() => setSel(i)} onClick={() => pick(i)}>
                    <span className="qs-ic"><a.Icon size={16} aria-hidden="true" /></span>
                    <span className="qs-txt"><b>{a.label}</b>{a.hint && <small>{a.hint}</small>}</span>
                    {sel === i && <CornerDownLeft size={14} aria-hidden="true" className="qs-enter" />}
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
