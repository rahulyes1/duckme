import Dexie, { type Table } from 'dexie';
import type { Card, Settings, Version } from './types';

/** A hard delete, remembered so the sync engine can delete the same row in the cloud. */
export interface Deletion {
  id: string;
  table: 'cards' | 'versions';
  at: number;
}

/**
 * Sync flag: while the sync engine writes rows it pulled from the cloud, the hooks below must not
 * bump updatedAt or log deletions (that would echo the change back up).
 */
export const syncState = { applyingRemote: false };

export class HisaabDB extends Dexie {
  cards!: Table<Card, string>;
  versions!: Table<Version, number>;
  settings!: Table<Settings, string>;
  deletions!: Table<Deletion, string>;

  constructor() {
    super('hisaab');
    this.version(1).stores({
      cards: 'id, type, status, pinned, due, date, updatedAt, *labels',
      versions: '++id, cardId, at',
      settings: 'key',
    });
    // v2: every card gets a rank (the ONLY sort order). Cards that already had one keep
    // their relative order; the rest follow, newest first.
    this.version(2).stores({
      cards: 'id, type, status, pinned, due, date, updatedAt, rank, *labels',
    }).upgrade(async tx => {
      const all = await tx.table<Card, string>('cards').toArray();
      const ranked = all.filter(c => c.rank > 0).sort((a, b) => a.rank - b.rank);
      const rest = all.filter(c => !(c.rank > 0)).sort((a, b) => b.createdAt - a.createdAt);
      const order = [...ranked, ...rest];
      for (let i = 0; i < order.length; i++) {
        await tx.table('cards').update(order[i].id, { rank: i + 1 });
      }
    });
    // v3: deletion log for cloud sync; index the new planning fields.
    this.version(3).stores({
      cards: 'id, type, status, pinned, due, date, updatedAt, rank, quadrant, journalDate, *labels',
      deletions: 'id, at',
    });

    // Every local change stamps updatedAt (sync uses it: newest write wins).
    this.cards.hook('updating', (mods: Partial<Card>, _key, obj: Card) => {
      if (syncState.applyingRemote || 'updatedAt' in mods) return undefined;
      // Always move forward, even if this device's clock is behind the last writer's.
      return { updatedAt: Math.max(Date.now(), (obj?.updatedAt ?? 0) + 1) };
    });
    // Every local hard delete is logged so it can be deleted in the cloud too.
    this.cards.hook('deleting', (primKey: string, _obj, tx) => {
      if (syncState.applyingRemote) return;
      tx.on('complete', () => { void this.deletions.put({ id: primKey, table: 'cards', at: Date.now() }); });
    });
  }
}

export const db = new HisaabDB();

export const DEFAULT_SETTINGS: Settings = {
  key: 'settings',
  salaryDay: 1,
  theme: 'system',
  budgets: {},
  labels: [],
  delayDays: 7,
};

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings');
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, key: 'settings' });
}
