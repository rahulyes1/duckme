/**
 * "Feels like AI, but it's rules": reads what you type for a priority and offers days, times and
 * deadlines. Pure functions (no DB, no React) so every rule is unit tested.
 *
 *   "Pay rent on"       → day chips (Today, Tomorrow, Sat, Mon, Salary day…)
 *   "Call bank at"      → time chips (10 am, 2 pm, 6 pm, after office…)
 *   "File ITR by"       → deadline chips (This Sunday, Month end, Before salary…)
 *   "kal", "parso", "next monday", "15th", "15 dec", "6pm" → picked up straight from the words
 */
import type { When } from '../../lib/types';
import { addDays, fmtDate, fromISO, nextSalary, toISO } from '../../lib/format';

export interface SmartState {
  /** Planned day (YYYY-MM-DD). */
  day?: string;
  /** Planned time (HH:mm, 24h). */
  time?: string;
  /** Deadline (YYYY-MM-DD). */
  due?: string;
}

export type ChipKind = 'day' | 'time' | 'due';
export type Trigger = 'on' | 'at' | 'by' | null;

export interface Chip {
  id: string;
  kind: ChipKind;
  label: string;
  /** Small second line, e.g. "Thu 26-11". */
  sub?: string;
  /** Value to set (ISO date or HH:mm); null = open a date picker. */
  value: string | null;
  /** Shown with a sparkle: a nudge, not a direct answer to a trigger word. */
  suggested?: boolean;
}

export interface Detected {
  kind: ChipKind;
  value: string;
  /** The exact words in the text, so they can be removed from the title. */
  match: string;
}

export interface Warning {
  id: string;
  text: string;
  fix?: { label: string; patch: SmartState };
}

export interface Habits {
  times: Record<string, number>;
  dues: Record<string, number>;
}

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DOW_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DUE_WORDS = /\b(by|before|till|until|due|deadline)\s*$/;

/** Indian bank holidays that fall on the same date every year. */
export const FIXED_HOLIDAYS: Record<string, string> = {
  '01-26': 'Republic Day',
  '05-01': 'Labour Day',
  '08-15': 'Independence Day',
  '10-02': 'Gandhi Jayanti',
  '12-25': 'Christmas',
};

const BILLISH = /\b(pay|paid|renew|file|bill|emi|rent|kiraya|recharge|insurance|premium|fees?|tax|itr|puc|loan|card|bijli|electricity|wifi|broadband|sip)\b/i;

const dayName = (d: Date) => DOW_LABEL[d.getDay()];
/** "Thu 26-11" */
export const shortDay = (iso: string) => `${dayName(fromISO(iso))} ${fmtDate(iso).slice(0, 5)}`;

/** Next date (today included) that falls on weekday `dow` (0 = Sunday). */
export function nextWeekday(dow: number, ref: Date, includeToday = true): Date {
  let diff = (dow - ref.getDay() + 7) % 7;
  if (diff === 0 && !includeToday) diff = 7;
  return addDays(ref, diff);
}

const endOfMonth = (ref: Date) => new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
const thisSunday = (ref: Date) => nextWeekday(0, ref, true);

/** Day-of-month (and optional month) → next date on/after ref, clamped to the month's last day. */
function dayOfMonth(day: number, monthIdx: number, ref: Date): Date {
  const mk = (y: number, m: number) => {
    const last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(day, last));
  };
  if (monthIdx >= 0) {
    let d = mk(ref.getFullYear(), monthIdx);
    if (d < ref) d = mk(ref.getFullYear() + 1, monthIdx);
    return d;
  }
  let d = mk(ref.getFullYear(), ref.getMonth());
  if (d < ref) d = mk(ref.getFullYear(), ref.getMonth() + 1);
  return d;
}

/** 24h "HH:mm" from hour/min/ampm. Without am/pm: 1–7 → pm, 8–11 → am, 12 → noon. */
export function toTime(h: number, m = 0, ampm?: string): string | null {
  if (h > 23 || m > 59) return null;
  let hh = h;
  if (ampm === 'pm' && h < 12) hh = h + 12;
  else if (ampm === 'am' && h === 12) hh = 0;
  else if (!ampm && h >= 1 && h <= 7) hh = h + 12;
  return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "6 pm", "6:30 pm", "10 am" */
export function timeLabel(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
}

/** What the last word asks for: "on" → a day, "at" → a time, "by"/"before"… → a deadline. */
export function triggerOf(text: string): Trigger {
  const t = text.toLowerCase().trimEnd();
  if (!/\s/.test(text) && !/^(on|at|by)$/.test(t)) return null;
  if (/\b(on)$/.test(t)) return 'on';
  if (/\b(at)$/.test(t)) return 'at';
  if (DUE_WORDS.test(t)) return 'by';
  return null;
}

/** Dates, days and times written in the text ("kal", "next monday", "15th", "15 dec", "6pm"). */
export function detect(text: string, ref: Date): Detected[] {
  const out: Detected[] = [];
  const lower = text.toLowerCase();
  const seen = new Set<string>();
  const push = (kind: ChipKind, value: string, start: number, end: number) => {
    // A date preceded by "by / before / till / due" is a deadline, not the planned day.
    let s = start;
    let k = kind;
    if (kind === 'day') {
      const before = lower.slice(0, start);
      const m = before.match(/\b(by|before|till|until|due|deadline)\s+$/);
      if (m) { k = 'due'; s = start - m[0].length; }
      else {
        const on = before.match(/\bon\s+$/);
        if (on) s = start - on[0].length;
      }
    } else {
      const at = lower.slice(0, start).match(/\bat\s+$/);
      if (at) s = start - at[0].length;
    }
    const key = `${k}:${s}`;
    if (seen.has(key) || out.some(o => o.kind === k)) return;
    seen.add(key);
    out.push({ kind: k, value, match: text.slice(s, end) });
  };
  const scan = (re: RegExp, fn: (m: RegExpExecArray) => { kind: ChipKind; value: string } | null) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower))) {
      const r = fn(m);
      if (r) push(r.kind, r.value, m.index, m.index + m[0].length);
    }
  };

  scan(/\b(day after tomorrow|parso|parson)\b/g, () => ({ kind: 'day', value: toISO(addDays(ref, 2)) }));
  scan(/\b(today|aaj|tonight)\b/g, () => ({ kind: 'day', value: toISO(ref) }));
  scan(/\b(tomorrow|tmrw|kal)\b/g, () => ({ kind: 'day', value: toISO(addDays(ref, 1)) }));
  scan(/\bin (\d{1,2}) days?\b/g, m => ({ kind: 'day', value: toISO(addDays(ref, +m[1])) }));
  scan(/\b(this weekend)\b/g, () => ({ kind: 'day', value: toISO(nextWeekday(6, ref)) }));
  scan(/\b(month end|end of (?:the )?month)\b/g, () => ({ kind: 'day', value: toISO(endOfMonth(ref)) }));
  // "next monday" = the coming Monday (never today), the way most people say it.
  scan(/\bnext (sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/g, m => ({ kind: 'day', value: toISO(nextWeekday(DOW.indexOf(m[1]), ref, false)) }));
  scan(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g,
    m => ({ kind: 'day', value: toISO(dayOfMonth(+m[1], MONTHS.indexOf(m[2]), ref)) }));
  scan(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/g,
    m => ({ kind: 'day', value: toISO(dayOfMonth(+m[2], MONTHS.indexOf(m[1]), ref)) }));
  scan(/\b(\d{1,2})(st|nd|rd|th)\b/g, m => (+m[1] >= 1 && +m[1] <= 31 ? { kind: 'day', value: toISO(dayOfMonth(+m[1], -1, ref)) } : null));
  scan(/\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?\b/g, m => {
    const idx = DOW.indexOf(m[1].slice(0, 3));
    // Skip if it was part of "next monday" (already handled).
    if (/next\s+$/.test(lower.slice(0, m.index))) return null;
    return idx >= 0 ? { kind: 'day', value: toISO(nextWeekday(idx, ref)) } : null;
  });

  scan(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/g, m => { const t = toTime(+m[1], m[2] ? +m[2] : 0, m[3]); return t ? { kind: 'time', value: t } : null; });
  scan(/\bat (\d{1,2})(?::(\d{2}))?\b(?!\s*(am|pm|st|nd|rd|th|days?))/g, m => { const t = toTime(+m[1], m[2] ? +m[2] : 0); return t ? { kind: 'time', value: t } : null; });
  scan(/\b(morning|subah)\b/g, () => ({ kind: 'time', value: '09:00' }));
  scan(/\b(lunch|afternoon|dopahar)\b/g, () => ({ kind: 'time', value: '14:00' }));
  scan(/\b(after office|after work)\b/g, () => ({ kind: 'time', value: '19:00' }));
  scan(/\b(evening|shaam)\b/g, () => ({ kind: 'time', value: '18:00' }));
  scan(/\b(night|raat|tonight)\b/g, () => ({ kind: 'time', value: '21:00' }));

  // Keep one of each kind, in the order they appear.
  return out;
}

/** Title with the recognised words (and a dangling "on/at/by") removed. */
export function cleanTitle(text: string, used: Detected[]): string {
  let t = text;
  for (const d of used) t = t.replace(d.match, ' ');
  t = t.replace(/\s+(on|at|by|before|till|until|due)\s*$/i, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

const rank = (counts: Record<string, number>, key: string) => -(counts[key] ?? 0);

/** Chips for the current trigger word, ordered by your habits; plus a nudge for bill-like tasks. */
export function chipsFor(text: string, ref: Date, salaryDay: number, habits: Habits, state: SmartState): Chip[] {
  const trig = triggerOf(text);
  const sal = nextSalary(salaryDay, ref);
  const salISO = toISO(sal);
  const t = toISO(ref);

  if (trig === 'on') {
    const sat = nextWeekday(6, ref, true);
    const mon = nextWeekday(1, ref, false);
    const list: Chip[] = [
      { id: 'd-today', kind: 'day', label: 'Today', sub: shortDay(t), value: t },
      { id: 'd-tmrw', kind: 'day', label: 'Tomorrow', sub: shortDay(toISO(addDays(ref, 1))), value: toISO(addDays(ref, 1)) },
    ];
    if (toISO(sat) > toISO(addDays(ref, 1))) list.push({ id: 'd-sat', kind: 'day', label: 'Saturday', sub: shortDay(toISO(sat)), value: toISO(sat) });
    list.push({ id: 'd-mon', kind: 'day', label: 'Monday', sub: shortDay(toISO(mon)), value: toISO(mon) });
    if (salISO > toISO(addDays(ref, 1))) list.push({ id: 'd-sal', kind: 'day', label: 'Salary day', sub: shortDay(salISO), value: salISO });
    list.push({ id: 'd-pick', kind: 'day', label: 'Pick a date', value: null });
    return list;
  }
  if (trig === 'at') {
    const times: [string, string][] = [['09:00', 'Morning'], ['10:00', ''], ['14:00', 'Lunch break'], ['18:00', 'Evening'], ['19:00', 'After office'], ['21:00', 'Night']];
    return times
      .map(([v, sub]) => ({ id: `t-${v}`, kind: 'time' as const, label: timeLabel(v), sub: sub || undefined, value: v }))
      .sort((a, b) => rank(habits.times, a.value!) - rank(habits.times, b.value!));
  }
  if (trig === 'by') {
    const dues: Chip[] = [
      { id: 'u-sun', kind: 'due', label: 'This Sunday', sub: shortDay(toISO(thisSunday(ref))), value: toISO(thisSunday(ref)) },
      { id: 'u-eom', kind: 'due', label: 'Month end', sub: shortDay(toISO(endOfMonth(ref))), value: toISO(endOfMonth(ref)) },
      { id: 'u-sal', kind: 'due', label: 'Before salary', sub: shortDay(toISO(addDays(sal, -1))), value: toISO(addDays(sal, -1)) },
      { id: 'u-tmrw', kind: 'due', label: 'Tomorrow', sub: shortDay(toISO(addDays(ref, 1))), value: toISO(addDays(ref, 1)) },
      { id: 'u-week', kind: 'due', label: 'In a week', sub: shortDay(toISO(addDays(ref, 7))), value: toISO(addDays(ref, 7)) },
    ];
    const keyOf = (c: Chip) => c.id;
    return [...dues.sort((a, b) => rank(habits.dues, keyOf(a)) - rank(habits.dues, keyOf(b))),
      { id: 'u-pick', kind: 'due', label: 'Pick a date', value: null }];
  }
  // No trigger: gentle nudges.
  const out: Chip[] = [];
  if (text.trim().length >= 3 && BILLISH.test(text) && !state.due) {
    const before = addDays(sal, -1);
    if (toISO(before) >= t) out.push({ id: 'u-sal', kind: 'due', label: 'Before salary', sub: shortDay(toISO(before)), value: toISO(before), suggested: true });
    out.push({ id: 'u-sun', kind: 'due', label: 'By Sunday', sub: shortDay(toISO(thisSunday(ref))), value: toISO(thisSunday(ref)), suggested: true });
  }
  return out;
}

/** Real-life checks with one-tap fixes. */
export function warningsFor(s: SmartState, ref: Date): Warning[] {
  const w: Warning[] = [];
  const t = toISO(ref);
  if (s.due) {
    const d = fromISO(s.due);
    if (s.due < t) w.push({ id: 'due-past', text: 'That deadline has already passed.', fix: { label: 'Make it tomorrow', patch: { due: toISO(addDays(ref, 1)) } } });
    const hol = FIXED_HOLIDAYS[s.due.slice(5)];
    if (hol) {
      w.push({ id: 'due-hol', text: `${shortDay(s.due)} is ${hol}: banks are closed.`, fix: { label: `Day before (${shortDay(toISO(addDays(d, -1)))})`, patch: { due: toISO(addDays(d, -1)) } } });
    } else if (d.getDay() === 0) {
      w.push({ id: 'due-sun', text: 'Deadline is a Sunday: banks and offices are shut.', fix: { label: `Saturday (${shortDay(toISO(addDays(d, -1)))})`, patch: { due: toISO(addDays(d, -1)) } } });
    }
  }
  if (s.day && s.due && s.day > s.due) {
    w.push({ id: 'after-due', text: 'You planned it after the deadline.', fix: { label: `Do it ${shortDay(s.due)}`, patch: { day: s.due } } });
  }
  if (s.day && s.day < t) {
    w.push({ id: 'day-past', text: 'That day has already gone.', fix: { label: 'Make it today', patch: { day: t } } });
  }
  return w;
}

/** The planning slot for a picked day, or the section's default when no day is picked. */
export function whenFrom(s: SmartState, fallback: When): When {
  return s.day ? { unit: 'day', start: s.day } : fallback;
}

/** Reminder "YYYY-MM-DDTHH:mm" on the planned day (or today) at the picked time. */
export function reminderFrom(s: SmartState, ref: Date): string | undefined {
  if (!s.time) return undefined;
  return `${s.day ?? toISO(ref)}T${s.time}`;
}

/* ---------- habits (what you usually pick) ---------- */

const HABIT_KEY = 'hisaab.habits';
export function loadHabits(): Habits {
  try {
    const raw = localStorage.getItem(HABIT_KEY);
    const h = raw ? JSON.parse(raw) : null;
    return { times: h?.times ?? {}, dues: h?.dues ?? {} };
  } catch { return { times: {}, dues: {} }; }
}
export function learn(kind: 'times' | 'dues', key: string): void {
  try {
    const h = loadHabits();
    h[kind][key] = (h[kind][key] ?? 0) + 1;
    localStorage.setItem(HABIT_KEY, JSON.stringify(h));
  } catch { /* storage blocked */ }
}
