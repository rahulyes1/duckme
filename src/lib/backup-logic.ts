import type { Settings, Version } from './types';

/* Pure helpers for Backup to file / Restore from file and the Home backup nudge. No DOM, no Dexie. */

const DAY = 86400000;
export const NUDGE_AFTER_DAYS = 7;
export const NUDGE_DISMISS_KEY = 'hisaab.backupNudgeDismissedAt';

/**
 * Should Home show "Last backup: X days ago · Back up now"?
 * Only when there are cards, the last backup is missing or older than 7 days, and the line
 * was not dismissed in the last day. `days` is null when there has never been a backup.
 */
export function backupNudge(o: { cardCount: number; lastBackupAt?: number; dismissedAt?: number; now: number }): { show: boolean; days: number | null } {
  const days = o.lastBackupAt ? Math.max(0, Math.floor((o.now - o.lastBackupAt) / DAY)) : null;
  if (o.cardCount <= 0) return { show: false, days };
  if (o.dismissedAt && o.now - o.dismissedAt < DAY && o.now >= o.dismissedAt) return { show: false, days };
  const stale = days === null || o.now - (o.lastBackupAt ?? 0) >= NUDGE_AFTER_DAYS * DAY;
  return { show: stale, days };
}

export function backupNudgeText(days: number | null): string {
  if (days === null) return 'Never backed up';
  return `Last backup: ${days} day${days === 1 ? '' : 's'} ago`;
}

/* ---------------- restore ---------------- */

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isEmpty = (x: unknown) =>
  x === undefined || x === null || x === '' || (Array.isArray(x) && x.length === 0) || (isObj(x) && Object.keys(x).length === 0);

/** Fields brought back from a backup only when this device has none of its own (or no cards at all). */
type FillField = 'salaryDay' | 'salaryAmount' | 'accounts' | 'reminders' | 'weeklyAllowance' | 'udhaar'
  | 'splitPeople' | 'customCategories' | 'upiId' | 'upiName' | 'favCategories' | 'userName';

const VALID: Record<FillField, (v: unknown) => boolean> = {
  salaryDay: v => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31,
  salaryAmount: v => typeof v === 'number' && Number.isFinite(v) && v > 0,
  weeklyAllowance: v => typeof v === 'number' && Number.isFinite(v) && v > 0,
  accounts: v => Array.isArray(v) && v.every(a => isObj(a) && typeof a.name === 'string'),
  udhaar: v => Array.isArray(v) && v.every(a => isObj(a) && typeof a.id === 'string'),
  splitPeople: v => Array.isArray(v) && v.every(s => typeof s === 'string'),
  favCategories: v => Array.isArray(v) && v.every(s => typeof s === 'string'),
  customCategories: v => Array.isArray(v) && v.every(s => typeof s === 'string'),
  reminders: v => isObj(v) && typeof v.bills === 'boolean' && typeof v.salary === 'boolean' && typeof v.hour === 'number',
  upiId: v => typeof v === 'string' && v.trim() !== '',
  upiName: v => typeof v === 'string' && v.trim() !== '',
  userName: v => typeof v === 'string' && v.trim() !== '',
};
const FILL_FIELDS = Object.keys(VALID) as FillField[];

/** Does this device already have its own value for the field? salaryDay 1 with no salary set counts as "not set up". */
function deviceHas(mine: Settings, f: FillField): boolean {
  if (f === 'salaryDay') return !isEmpty(mine.salaryDay) && !(mine.salaryDay === 1 && !mine.salaryAmount);
  return !isEmpty(mine[f]);
}

function byId<T extends { id: string }>(mine: T[] | undefined, theirs: unknown): T[] {
  const list = [...(mine ?? [])];
  for (const x of (Array.isArray(theirs) ? theirs : []) as T[]) {
    if (isObj(x) && typeof x.id === 'string' && !list.some(m => m.id === x.id)) list.push(x);
  }
  return list;
}

/**
 * The settings patch to save after a restore. Labels and budgets merge (yours win), goals and loans
 * add the ones you don't have, and the rest fill in only what this device is missing — or everything,
 * on a device with no cards yet. pinHash is never imported.
 */
export function mergeRestoredSettings(mine: Settings, file: unknown, deviceHasCards: boolean, cardLabels: string[] = []): Partial<Settings> {
  const s = isObj(file) ? file : {};
  const labels = new Set(mine.labels ?? []);
  for (const l of Array.isArray(s.labels) ? s.labels : []) if (typeof l === 'string') labels.add(l);
  for (const l of cardLabels) labels.add(l);
  const budgets = { ...(isObj(s.budgets) ? (s.budgets as Record<string, number>) : {}), ...(mine.budgets ?? {}) };
  const patch: Partial<Settings> = {
    labels: [...labels],
    budgets,
    goals: byId(mine.goals, s.goals),
    loans: byId(mine.loans, s.loans),
    ...(mine.incomes?.length || Array.isArray(s.incomes) ? { incomes: byId(mine.incomes, s.incomes) } : {}),
  };
  for (const f of FILL_FIELDS) {
    const v = s[f];
    if (!VALID[f](v)) continue;
    if (!deviceHasCards || !deviceHas(mine, f)) (patch as Record<string, unknown>)[f] = v;
  }
  return patch;
}

/**
 * Note history from a backup, ready for bulkPut: ids dropped (so they never overwrite this
 * device's own history rows) and entries this device already has (same card + time) skipped.
 */
export function versionsToRestore(existing: Pick<Version, 'cardId' | 'at'>[], incoming: unknown): Version[] {
  const seen = new Set(existing.map(v => `${v.cardId}|${v.at}`));
  const out: Version[] = [];
  for (const x of Array.isArray(incoming) ? incoming : []) {
    if (!isObj(x) || typeof x.cardId !== 'string' || typeof x.at !== 'number') continue;
    const k = `${x.cardId}|${x.at}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const { id: _drop, ...rest } = x as unknown as Version;
    out.push({ ...rest, title: typeof rest.title === 'string' ? rest.title : '', body: typeof rest.body === 'string' ? rest.body : '' });
  }
  return out;
}
