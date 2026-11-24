/** Money and date helpers. Dates are stored as local "YYYY-MM-DD" strings. */

export const inr = (n: number | undefined | null): string =>
  '₹' + Math.round(n ?? 0).toLocaleString('en-IN');

/** Compact rupees: ₹1.2L, ₹18k. */
export const inrShort = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e7) return '₹' + +(n / 1e7).toFixed(2) + 'Cr';
  if (a >= 1e5) return '₹' + +(n / 1e5).toFixed(2) + 'L';
  if (a >= 1e3) return '₹' + +(n / 1e3).toFixed(1) + 'k';
  return inr(n);
};

const pad = (n: number) => String(n).padStart(2, '0');

export const toISO = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromISO = (s: string): Date => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const today = (): Date => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};
export const todayISO = (): string => toISO(today());

export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Adds months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export const addMonths = (d: Date, n: number): Date => {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last));
};

export const addDaysISO = (s: string, n: number) => toISO(addDays(fromISO(s), n));
export const addMonthsISO = (s: string, n: number) => toISO(addMonths(fromISO(s), n));

export const daysBetween = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / 864e5);
export const daysLeft = (iso: string): number => daysBetween(today(), fromISO(iso));

export const fmtDate = (iso: string): string =>
  fromISO(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const fmtDateY = (iso: string): string =>
  fromISO(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtMonth = (d: Date): string => d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export const dueLabel = (iso: string): string => {
  const n = daysLeft(iso);
  if (n < 0) return `Overdue ${-n}d`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `${n} days left`;
};
export const dueTone = (iso: string): 'late' | 'urgent' | 'normal' => {
  const n = daysLeft(iso);
  return n < 0 ? 'late' : n <= 3 ? 'urgent' : 'normal';
};

/** Next salary credit date on or after today. */
export const nextSalary = (salaryDay: number, from: Date = today()): Date => {
  const mk = (y: number, m: number) => {
    const last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(salaryDay, last));
  };
  const thisMonth = mk(from.getFullYear(), from.getMonth());
  return thisMonth >= from ? thisMonth : mk(from.getFullYear(), from.getMonth() + 1);
};

/** 'before' = due before the next salary credit, 'after' = within the month after it. */
export const salarySide = (iso: string, salaryDay: number): 'before' | 'after' => {
  return fromISO(iso) < nextSalary(salaryDay) ? 'before' : 'after';
};

export const uid = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const buzz = (p: number | number[]) => {
  try { navigator.vibrate?.(p); } catch { /* not supported */ }
};
