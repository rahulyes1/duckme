/**
 * Which reminders are due right now. Pure: cards + settings + time in, notifications out.
 * The same rules run in the service worker (public/sw.js) for background checks: keep them in step.
 */
import type { Card, Settings } from './types';
import { inr, toISO } from './format';

export interface ReminderPrefs { bills: boolean; salary: boolean; /** hour of day (0–23) after which reminders show */ hour: number; /** documents & warranties (default on) */ expiry?: boolean }
export const DEFAULT_REMINDERS: ReminderPrefs = { bills: true, salary: true, hour: 9 };

export interface Reminder { tag: string; title: string; body: string; url: string }

const pad = (n: number) => String(n).padStart(2, '0');
const ddmm = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

function salaryDateOf(y: number, m: number, day: number): Date {
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(Math.max(1, day), last));
}

export function dueReminders(cards: Card[], settings: Pick<Settings, 'salaryDay'> & { reminders?: ReminderPrefs }, now: Date): Reminder[] {
  const prefs = settings.reminders ?? DEFAULT_REMINDERS;
  const today = toISO(now);
  // Reminders you set on a card fire at their own time, not at the morning hour.
  const stamp = `${today}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const own: Reminder[] = cards
    .filter(c => c.reminder && c.reminder.startsWith(today) && c.reminder <= stamp && (c.status === 'open' || c.status === 'delayed'))
    .map(c => ({
      tag: `card-${c.id}-${c.reminder}`,
      title: c.locked ? 'Locked note' : c.title || 'Reminder',
      body: 'You asked to be reminded now.',
      url: c.type === 'bill' ? '#money' : '#home',
    }));
  if (now.getHours() < prefs.hour) return own;
  const tomorrow = toISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const out: Reminder[] = [...own];

  if (prefs.bills) {
    const bills = cards
      .filter(c => c.type === 'bill' && (c.status === 'open' || c.status === 'delayed') && c.due && c.due <= tomorrow && !c.autopay)
      .sort((a, b) => (a.due! < b.due! ? -1 : 1));
    for (const b of bills) {
      const when = b.due === tomorrow ? 'due tomorrow' : b.due === today ? 'due today' : `overdue since ${ddmm(b.due!)}`;
      const amt = b.amount ? `${inr(b.amount)} ` : '';
      out.push({
        tag: `bill-${b.id}-${b.due}-${today}`,
        title: `${b.title || 'Bill'} · ${amt}${when}`,
        body: b.penalty ? `Pay to avoid: ${b.penalty}` : 'Tap to open, then swipe right or tap Paid once it is done.',
        url: '#money',
      });
    }
  }

  if (prefs.expiry !== false) {
    for (const c of cards) {
      if (!c.expiry || c.status === 'trashed' || c.status === 'killed') continue;
      const days = Math.round((new Date(c.expiry + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000);
      if (![30, 7, 1, 0].includes(days)) continue;
      out.push({
        tag: `expiry-${c.id}-${c.expiry}-${days}`,
        title: `${c.title || 'Document'} ${days === 0 ? 'expires today' : days === 1 ? 'expires tomorrow' : `expires in ${days} days`}`,
        body: `On ${ddmm(c.expiry)}-${c.expiry.slice(0, 4)}. Renew or claim before then.`,
        url: '#notes',
      });
    }
  }

  if (prefs.salary) {
    const sd = salaryDateOf(now.getFullYear(), now.getMonth(), settings.salaryDay || 1);
    if (toISO(sd) === today) {
      out.push({
        tag: `salary-${today}`,
        title: 'Salary day',
        body: 'Your month recap is ready, and the payday checklist takes two minutes.',
        url: '#money',
      });
    }
  }
  return out;
}

/** Remembered per device so each reminder shows once a day. Keeps only today's tags. */
export function freshReminders(list: Reminder[], sent: string[]): Reminder[] {
  const s = new Set(sent);
  return list.filter(r => !s.has(r.tag));
}

export const todayTagSuffix = (now: Date) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
