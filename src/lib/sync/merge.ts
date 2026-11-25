/**
 * Pure sync decisions (no Dexie, no network) so they can be unit tested.
 * Rule everywhere: last write wins, judged by the row's own updatedAt (ms).
 */
import type { Card, Settings, Version } from '../types';

/** A row as it is stored in the cloud `cards` table. */
export interface RemoteCardRow {
  id: string;
  data: Card | Record<string, never>;
  updated_at: number;
  deleted: boolean;
  synced_at?: number;
}

export type PullDecision = 'put' | 'delete' | 'skip';

/**
 * What to do locally with one card row pulled from the cloud.
 * @param local the local card (undefined if it isn't on this device)
 * @param remote the cloud row
 * @param pendingDeletionAt when this device deleted the card and hasn't told the cloud yet
 */
export function decideCardPull(
  local: Pick<Card, 'updatedAt'> | undefined,
  remote: Pick<RemoteCardRow, 'updated_at' | 'deleted'>,
  pendingDeletionAt?: number,
): PullDecision {
  if (remote.deleted) {
    if (!local) return 'skip';
    // A local edit made after the cloud delete wins (it will be pushed and bring the card back).
    return local.updatedAt > remote.updated_at ? 'skip' : 'delete';
  }
  if (!local) {
    // Deleted here after the cloud's last edit: keep it deleted (the delete is pushed next).
    if (pendingDeletionAt !== undefined && pendingDeletionAt >= remote.updated_at) return 'skip';
    return 'put';
  }
  return remote.updated_at > local.updatedAt ? 'put' : 'skip';
}

/**
 * Local cards that must go up: changed after the last push, minus rows this very sync just
 * pulled from the cloud unchanged (no point echoing them back).
 */
export function selectCardsToPush(cards: Card[], lastPushAt: number, justPulled: Map<string, number> = new Map()): Card[] {
  return cards.filter(c => c.updatedAt > lastPushAt && justPulled.get(c.id) !== c.updatedAt);
}

/** Cloud row for a card. */
export function cardToRow(c: Card): { id: string; data: Card; updated_at: number; deleted: boolean } {
  return { id: c.id, data: c, updated_at: c.updatedAt, deleted: false };
}

/** Cloud text id for a version (local ids are auto-increment, so they differ per device). */
export const versionRowId = (v: Pick<Version, 'cardId' | 'at'>): string => `${v.cardId}:${v.at}`;

/** Version without its local auto-increment id. */
export function versionData(v: Version): Omit<Version, 'id'> {
  const { id: _id, ...rest } = v;
  return rest;
}

/** Which pulled versions are new on this device (matched by cardId + at). */
export function newVersions(local: Pick<Version, 'cardId' | 'at'>[], remote: Omit<Version, 'id'>[]): Omit<Version, 'id'>[] {
  const have = new Set(local.map(versionRowId));
  const out: Omit<Version, 'id'>[] = [];
  for (const r of remote) {
    const k = versionRowId(r);
    if (!have.has(k)) { have.add(k); out.push(r); }
  }
  return out;
}

/* ---------------- settings ---------------- */

/** Fields that never leave the device. */
const LOCAL_ONLY: (keyof Settings)[] = ['key', 'lastSyncAt'];

export type SyncedSettings = Partial<Omit<Settings, 'key' | 'lastSyncAt'>>;

/** Settings as they go to the cloud (pinHash included so the lock works everywhere). */
export function settingsForCloud(s: Partial<Settings> | undefined): SyncedSettings {
  const out: Record<string, unknown> = {};
  if (!s) return out;
  for (const [k, v] of Object.entries(s)) {
    if (LOCAL_ONLY.includes(k as keyof Settings) || v === undefined) continue;
    out[k] = v;
  }
  return out as SyncedSettings;
}

/** JSON with sorted keys, so equal objects always give equal strings. */
export function stableStringify(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

export const sameValue = (a: unknown, b: unknown): boolean => stableStringify(a) === stableStringify(b);

/**
 * Three-way settings merge, per field. `base` is what both sides last agreed on (or the app
 * defaults on a first sync). A field this device changed since `base` keeps the local value;
 * every other field takes the cloud's value (so removing the PIN on one device removes it on the
 * others). With no cloud row yet, the local settings go up as they are.
 */
export function mergeSettings(base: SyncedSettings, local: SyncedSettings, remote: SyncedSettings | null): SyncedSettings {
  if (!remote) return { ...local };
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  const out: Record<string, unknown> = {};
  const b = base as Record<string, unknown>;
  const l = local as Record<string, unknown>;
  const r = remote as Record<string, unknown>;
  for (const k of keys) {
    const localChanged = !sameValue(l[k], b[k]);
    const v = localChanged ? l[k] : r[k];
    if (v !== undefined) out[k] = v;
  }
  return out as SyncedSettings;
}

/* ---------------- retry ---------------- */

/** Backoff after the n-th failure in a row (1-based): 5s, 15s, 45s … capped at 5 min. */
export function backoffMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(5_000 * 3 ** (failures - 1), 300_000);
}
