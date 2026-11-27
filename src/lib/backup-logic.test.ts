import { describe, expect, it } from 'vitest';
import { backupNudge, backupNudgeText, mergeRestoredSettings, versionsToRestore } from './backup-logic';
import { DEFAULT_SETTINGS } from './db';
import type { Settings } from './types';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 27, 10);

describe('backupNudge', () => {
  it('stays quiet with no cards', () => {
    expect(backupNudge({ cardCount: 0, now: NOW }).show).toBe(false);
  });
  it('nudges when never backed up', () => {
    expect(backupNudge({ cardCount: 3, now: NOW })).toEqual({ show: true, days: null });
  });
  it('stays quiet within 7 days, nudges from day 7', () => {
    expect(backupNudge({ cardCount: 3, lastBackupAt: NOW - 6 * DAY, now: NOW }).show).toBe(false);
    expect(backupNudge({ cardCount: 3, lastBackupAt: NOW - 7 * DAY, now: NOW })).toEqual({ show: true, days: 7 });
  });
  it('dismiss hides it for one day only', () => {
    const old = NOW - 30 * DAY;
    expect(backupNudge({ cardCount: 3, lastBackupAt: old, dismissedAt: NOW - 2 * 3600000, now: NOW }).show).toBe(false);
    expect(backupNudge({ cardCount: 3, lastBackupAt: old, dismissedAt: NOW - DAY - 1, now: NOW }).show).toBe(true);
  });
  it('ignores a dismiss time in the future (clock change)', () => {
    expect(backupNudge({ cardCount: 3, dismissedAt: NOW + DAY, now: NOW }).show).toBe(true);
  });
  it('words the line plainly', () => {
    expect(backupNudgeText(null)).toBe('Never backed up');
    expect(backupNudgeText(1)).toBe('Last backup: 1 day ago');
    expect(backupNudgeText(9)).toBe('Last backup: 9 days ago');
  });
});

const fileSettings = {
  key: 'settings', salaryDay: 5, theme: 'light', budgets: { Food: 6000 }, labels: ['Home'], delayDays: 7,
  pinHash: 'abc', salaryAmount: 85000, accounts: [{ name: 'SBI', balance: 12000 }],
  reminders: { bills: true, salary: true, hour: 9 }, weeklyAllowance: 3000,
  udhaar: [{ id: 'u1', person: 'Amit', amount: 500 }], splitPeople: ['Amit'], upiId: 'r@sbi', upiName: 'Rahul',
  favCategories: ['Food'], userName: 'Rahul',
  goals: [{ id: 'g1', name: 'Trip' }], loans: [{ id: 'l1', name: 'Bike' }],
};

describe('mergeRestoredSettings', () => {
  it('brings back everything on a fresh device, never the PIN', () => {
    const p = mergeRestoredSettings({ ...DEFAULT_SETTINGS }, fileSettings, false);
    expect(p).toMatchObject({
      salaryDay: 5, salaryAmount: 85000, accounts: [{ name: 'SBI', balance: 12000 }], weeklyAllowance: 3000,
      reminders: { bills: true, salary: true, hour: 9 }, splitPeople: ['Amit'], upiId: 'r@sbi', upiName: 'Rahul',
      favCategories: ['Food'], userName: 'Rahul', budgets: { Food: 6000 }, labels: ['Home'],
    });
    expect(p.udhaar).toHaveLength(1);
    expect(p.goals).toHaveLength(1);
    expect(p.loans).toHaveLength(1);
    expect(p).not.toHaveProperty('pinHash');
    expect(p).not.toHaveProperty('theme');
  });

  it('keeps what this device already has when it has cards', () => {
    const mine: Settings = { ...DEFAULT_SETTINGS, salaryDay: 10, salaryAmount: 50000, userName: 'Me', budgets: { Food: 4000 },
      labels: ['Work'], goals: [{ id: 'g1', name: 'Mine' } as never] };
    const p = mergeRestoredSettings(mine, fileSettings, true, ['Bills']);
    expect(p.salaryDay).toBeUndefined();
    expect(p.salaryAmount).toBeUndefined();
    expect(p.userName).toBeUndefined();
    expect(p.upiId).toBe('r@sbi'); // missing here, so filled in
    expect(p.budgets).toEqual({ Food: 4000 });
    expect(p.labels).toEqual(['Work', 'Home', 'Bills']);
    expect(p.goals).toEqual([{ id: 'g1', name: 'Mine' }]);
    expect(p.loans).toHaveLength(1);
  });

  it('treats default salary day 1 with no salary as not set up', () => {
    const p = mergeRestoredSettings({ ...DEFAULT_SETTINGS }, fileSettings, true);
    expect(p.salaryDay).toBe(5);
  });

  it('skips bad values and survives a missing settings block', () => {
    const p = mergeRestoredSettings({ ...DEFAULT_SETTINGS }, { salaryDay: 40, salaryAmount: 'lots', accounts: 'x', userName: '  ' }, false);
    expect(p.salaryDay).toBeUndefined();
    expect(p.salaryAmount).toBeUndefined();
    expect(p.accounts).toBeUndefined();
    expect(p.userName).toBeUndefined();
    expect(mergeRestoredSettings({ ...DEFAULT_SETTINGS }, undefined, false)).toEqual({ labels: [], budgets: {}, goals: [], loans: [] });
  });
});

describe('versionsToRestore', () => {
  it('drops ids, skips history this device has and duplicates in the file', () => {
    const out = versionsToRestore([{ cardId: 'a', at: 1 }], [
      { id: 7, cardId: 'a', at: 1, title: 'x', body: '' },
      { id: 8, cardId: 'a', at: 2, title: 'y', body: 'b' },
      { id: 9, cardId: 'a', at: 2, title: 'y', body: 'b' },
      { cardId: 3, at: 'no' },
    ]);
    expect(out).toEqual([{ cardId: 'a', at: 2, title: 'y', body: 'b' }]);
  });
  it('handles a backup with no history', () => {
    expect(versionsToRestore([], undefined)).toEqual([]);
  });
});
