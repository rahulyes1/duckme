import { describe, expect, it } from 'vitest';
import type { Card, Version } from '../types';
import {
  backoffMs, cardToRow, decideCardPull, mergeSettings, newVersions, sameValue, selectCardsToPush, settingsForCloud,
  stableStringify, versionData, versionRowId,
} from './merge';

const card = (id: string, updatedAt: number): Card => ({
  id, type: 'note', title: id, body: '', color: 'white', pinned: false, labels: [], horizon: 'none', rank: 1,
  status: 'open', links: [], createdAt: 1, updatedAt,
});

describe('decideCardPull', () => {
  it('puts a card this device does not have', () => {
    expect(decideCardPull(undefined, { updated_at: 10, deleted: false })).toBe('put');
  });
  it('newer cloud edit wins, older or equal is skipped', () => {
    expect(decideCardPull({ updatedAt: 5 }, { updated_at: 10, deleted: false })).toBe('put');
    expect(decideCardPull({ updatedAt: 10 }, { updated_at: 10, deleted: false })).toBe('skip');
    expect(decideCardPull({ updatedAt: 20 }, { updated_at: 10, deleted: false })).toBe('skip');
  });
  it('cloud delete removes the local card unless the local edit is newer', () => {
    expect(decideCardPull({ updatedAt: 5 }, { updated_at: 10, deleted: true })).toBe('delete');
    expect(decideCardPull({ updatedAt: 10 }, { updated_at: 10, deleted: true })).toBe('delete');
    expect(decideCardPull({ updatedAt: 15 }, { updated_at: 10, deleted: true })).toBe('skip');
    expect(decideCardPull(undefined, { updated_at: 10, deleted: true })).toBe('skip');
  });
  it('a local delete not yet pushed beats an older cloud edit, loses to a newer one', () => {
    expect(decideCardPull(undefined, { updated_at: 10, deleted: false }, 12)).toBe('skip');
    expect(decideCardPull(undefined, { updated_at: 10, deleted: false }, 10)).toBe('skip');
    expect(decideCardPull(undefined, { updated_at: 20, deleted: false }, 12)).toBe('put');
  });
});

describe('selectCardsToPush', () => {
  it('pushes cards changed after the last push', () => {
    const out = selectCardsToPush([card('a', 5), card('b', 15), card('c', 25)], 10);
    expect(out.map(c => c.id)).toEqual(['b', 'c']);
  });
  it('does not echo rows just pulled unchanged, but does push them if edited since', () => {
    const pulled = new Map([['b', 15], ['c', 20]]);
    const out = selectCardsToPush([card('b', 15), card('c', 25)], 10, pulled);
    expect(out.map(c => c.id)).toEqual(['c']);
  });
  it('first sign-in (cursor 0) pushes everything local, so nothing is lost', () => {
    expect(selectCardsToPush([card('a', 1), card('b', 2)], 0)).toHaveLength(2);
  });
});

describe('rows', () => {
  it('maps a card to a cloud row', () => {
    const c = card('x', 42);
    expect(cardToRow(c)).toEqual({ id: 'x', data: c, updated_at: 42, deleted: false });
  });
  it('version ids are stable across devices and local ids are dropped', () => {
    const v: Version = { id: 7, cardId: 'n1', at: 1000, title: 't', body: 'b' };
    expect(versionRowId(v)).toBe('n1:1000');
    expect(versionData(v)).toEqual({ cardId: 'n1', at: 1000, title: 't', body: 'b' });
  });
  it('newVersions keeps only versions this device lacks, without duplicates', () => {
    const local = [{ cardId: 'a', at: 1 }];
    const remote = [
      { cardId: 'a', at: 1, title: '', body: '' },
      { cardId: 'a', at: 2, title: '', body: '' },
      { cardId: 'a', at: 2, title: '', body: '' },
    ];
    expect(newVersions(local, remote)).toEqual([{ cardId: 'a', at: 2, title: '', body: '' }]);
  });
});

describe('settings', () => {
  it('cloud copy drops device-only fields but keeps pinHash', () => {
    const s = settingsForCloud({ key: 'settings', salaryDay: 5, theme: 'dark', budgets: {}, labels: [], delayDays: 7, pinHash: 'h', lastSyncAt: 9 });
    expect(s).not.toHaveProperty('key');
    expect(s).not.toHaveProperty('lastSyncAt');
    expect(s.pinHash).toBe('h');
  });
  it('stableStringify ignores key order', () => {
    expect(stableStringify({ a: 1, b: { y: 2, x: 1 } })).toBe(stableStringify({ b: { x: 1, y: 2 }, a: 1 }));
    expect(sameValue({ a: undefined, b: 1 }, { b: 1 })).toBe(true);
  });
  it('no cloud row yet: local goes up as is', () => {
    expect(mergeSettings({}, { salaryDay: 3 }, null)).toEqual({ salaryDay: 3 });
  });
  it('fresh device (defaults) takes the cloud values instead of overwriting them', () => {
    const defaults = { salaryDay: 1, theme: 'system' as const, budgets: {}, labels: [], delayDays: 7 as const };
    const local = { ...defaults, consentAt: 50 };
    const remote = { ...defaults, salaryDay: 25, labels: ['home'], pinHash: 'h', consentAt: 10 };
    const m = mergeSettings(defaults, local, remote);
    expect(m.salaryDay).toBe(25);
    expect(m.labels).toEqual(['home']);
    expect(m.pinHash).toBe('h');
    expect(m.consentAt).toBe(50); // changed locally, kept
  });
  it('both sides changed different fields: both kept', () => {
    const base = { salaryDay: 1, budgets: {} };
    const m = mergeSettings(base, { salaryDay: 7, budgets: {} }, { salaryDay: 1, budgets: { Food: 5000 } });
    expect(m).toEqual({ salaryDay: 7, budgets: { Food: 5000 } });
  });
  it('removing the PIN on another device removes it here; removing it here wins over the cloud', () => {
    const base = { salaryDay: 1, pinHash: 'h' };
    expect(mergeSettings(base, { salaryDay: 1, pinHash: 'h' }, { salaryDay: 1 })).toEqual({ salaryDay: 1 });
    expect(mergeSettings(base, { salaryDay: 1 }, { salaryDay: 1, pinHash: 'h' })).toEqual({ salaryDay: 1 });
  });
});

describe('backoffMs', () => {
  it('grows and caps', () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(5000);
    expect(backoffMs(2)).toBe(15000);
    expect(backoffMs(10)).toBe(300000);
  });
});
