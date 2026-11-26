import { useMemo, useState } from 'react';
import { Repeat, X } from 'lucide-react';
import { useApp } from '../../app-context';
import { createCard } from '../../lib/actions';
import { inr, toISO, today } from '../../lib/format';
import { recurringCandidates, type Recurring } from '../../lib/capture';
import type { Card } from '../../lib/types';

const KEY = 'hisaab.recurring.dismissed';
const readDismissed = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const writeDismissed = (v: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 23rd … 31st */
const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
};

/** Next date on this day of the month, today or later (clamped to short months). */
function nextOn(day: number, ref: Date): string {
  for (let i = 0; i < 2; i++) {
    const y = ref.getFullYear(), m = ref.getMonth() + i;
    const last = new Date(y, m + 1, 0).getDate();
    const d = new Date(y, m, Math.min(day, last));
    if (d >= new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())) return toISO(d);
  }
  return toISO(new Date(ref.getFullYear(), ref.getMonth() + 1, day));
}

/** "You've paid Netflix ₹649 in 3 months. Track it as a bill?" — one tap makes a monthly bill. */
export function RecurringSuggest({ cards }: { cards: Card[] }) {
  const { toast } = useApp();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const list = useMemo(() => recurringCandidates(cards, today()).filter(r => !dismissed.includes(r.title.toLowerCase())).slice(0, 3), [cards, dismissed]);
  if (!list.length) return null;

  const track = async (r: Recurring) => {
    const due = nextOn(r.day, today());
    await createCard({ type: 'bill', title: r.title, amount: r.amount, due, repeat: 'monthly' });
    toast(`${r.title} is now a monthly bill, next due ${due.slice(8, 10)}-${due.slice(5, 7)}`);
  };
  const dismiss = (r: Recurring) => { const v = [...dismissed, r.title.toLowerCase()]; setDismissed(v); writeDismissed(v); };

  return (
    <section className="money-card money-wide rs" aria-labelledby="rs-h">
      <h2 id="rs-h" className="money-h"><Repeat size={18} aria-hidden="true" /> Looks regular</h2>
      <p className="money-muted">You pay these every month. Track them as bills to get reminders and see them before salary.</p>
      <ul className="rs-list">
        {list.map(r => (
          <li key={r.title} className="rs-row">
            <span className="rs-txt"><b>{r.title}</b><small className="num">{inr(r.amount)} · around the {ordinal(r.day)} ·{r.months} months</small></span>
            <button type="button" className="btn primary rs-go" onClick={() => track(r)}>Track as bill</button>
            <button type="button" className="icon-btn" aria-label={`Not a bill: ${r.title}`} onClick={() => dismiss(r)}><X size={18} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}
