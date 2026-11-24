import Dexie, { type Table } from 'dexie';
import type { Card, Settings, Version } from './types';

export class HisaabDB extends Dexie {
  cards!: Table<Card, string>;
  versions!: Table<Version, number>;
  settings!: Table<Settings, string>;

  constructor() {
    super('hisaab');
    this.version(1).stores({
      cards: 'id, type, status, pinned, due, date, updatedAt, *labels',
      versions: '++id, cardId, at',
      settings: 'key',
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
};

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings');
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, key: 'settings' });
}
