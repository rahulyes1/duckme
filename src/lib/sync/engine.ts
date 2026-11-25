/**
 * Offline-first cloud sync. The device is always the source the app reads from; the cloud is a
 * mirror that several devices merge through, last write wins (by each row's updatedAt).
 *
 * One sync = pull cards, pull versions, merge settings, push cards, push deletions, push versions.
 * Pull cursors use the server's own `synced_at` clock (not device clocks), so a device whose clock
 * is behind can never "hide" a change from the others.
 */
import { liveQuery } from 'dexie';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { db, DEFAULT_SETTINGS, syncState } from '../db';
import type { Card, Settings, Version } from '../types';
import { getClient, isConfigured } from './client';
import {
  backoffMs, cardToRow, decideCardPull, mergeSettings, newVersions, sameValue, selectCardsToPush, settingsForCloud,
  stableStringify, versionData, versionRowId, type RemoteCardRow, type SyncedSettings,
} from './merge';
import { getSnapshot, setSnapshot } from './store';

const PAGE = 500;
const PUSH_BATCH = 100;
/** Re-read this much of the cloud's recent history each time (covers commits that land late). */
const OVERLAP_MS = 5_000;
const INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 2_000;
const LAST_SYNC_WRITE_MS = 5 * 60_000;
const OAUTH_FLAG = 'hisaab-oauth-pending';

/* ---------------- per-user cursors (localStorage) ---------------- */

interface Cursors {
  /** Local clock: cards changed after this still need pushing. */
  pushAt: number;
  /** Local clock: versions created after this still need pushing. */
  versionsPushAt: number;
  /** Server clock (synced_at) high-water marks. */
  pullCards: number;
  pullVersions: number;
  /** Settings both sides last agreed on (three-way merge base). */
  settingsBase?: SyncedSettings;
}

const cursorKey = (userId: string) => `hisaab-sync:${userId}`;
const EMPTY: Cursors = { pushAt: 0, versionsPushAt: 0, pullCards: 0, pullVersions: 0 };

function loadCursors(userId: string): Cursors {
  try {
    const raw = localStorage.getItem(cursorKey(userId));
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<Cursors>) };
  } catch { /* private mode / corrupt: start from zero, merging is idempotent */ }
  return { ...EMPTY };
}

function saveCursors(userId: string, c: Cursors): void {
  try { localStorage.setItem(cursorKey(userId), JSON.stringify(c)); } catch { /* ignore */ }
}

function clearCursors(userId: string): void {
  try { localStorage.removeItem(cursorKey(userId)); } catch { /* ignore */ }
}

/* ---------------- one sync pass ---------------- */

function fail(error: { message?: string; code?: string; status?: number } | null): void {
  if (!error) return;
  const e = new Error(error.message || 'Sync failed') as Error & { code?: string; status?: number };
  e.code = error.code;
  e.status = error.status;
  throw e;
}

const isCard = (d: unknown): d is Card =>
  !!d && typeof d === 'object' && typeof (d as Card).type === 'string' && typeof (d as Card).status === 'string';

async function applyCardRows(rows: RemoteCardRow[], justPulled: Map<string, number>): Promise<boolean> {
  let changed = false;
  await db.transaction('rw', db.cards, db.deletions, async () => {
    syncState.applyingRemote = true;
    try {
      const ids = rows.map(r => r.id);
      const [locals, dels] = await Promise.all([db.cards.bulkGet(ids), db.deletions.bulkGet(ids)]);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const del = dels[i]?.table === 'cards' ? dels[i] : undefined;
        const decision = decideCardPull(locals[i], r, del?.at);
        if (decision === 'put') {
          if (!isCard(r.data)) continue;
          await db.cards.put({ ...r.data, id: r.id, updatedAt: Number(r.updated_at) });
          justPulled.set(r.id, Number(r.updated_at));
          if (del) await db.deletions.delete(r.id); // the cloud edit is newer than our delete
          changed = true;
        } else if (decision === 'delete') {
          await db.cards.delete(r.id);
          changed = true;
        }
      }
    } finally {
      syncState.applyingRemote = false;
    }
  });
  return changed;
}

async function pullCards(client: SupabaseClient, userId: string, cur: Cursors, justPulled: Map<string, number>): Promise<boolean> {
  const from = Math.max(0, cur.pullCards - OVERLAP_MS);
  let changed = false;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.from('cards')
      .select('id,data,updated_at,deleted,synced_at')
      .eq('user_id', userId).gt('synced_at', from)
      .order('synced_at', { ascending: true }).order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    fail(error);
    const rows = (data ?? []) as RemoteCardRow[];
    if (rows.length) {
      if (await applyCardRows(rows, justPulled)) changed = true;
      cur.pullCards = Math.max(cur.pullCards, ...rows.map(r => Number(r.synced_at) || 0));
      saveCursors(userId, cur);
    }
    if (rows.length < PAGE) break;
  }
  return changed;
}

async function pullVersions(client: SupabaseClient, userId: string, cur: Cursors): Promise<boolean> {
  const from = Math.max(0, cur.pullVersions - OVERLAP_MS);
  let changed = false;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.from('versions')
      .select('id,data,synced_at')
      .eq('user_id', userId).gt('synced_at', from)
      .order('synced_at', { ascending: true }).order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    fail(error);
    const rows = (data ?? []) as { id: string; data: Omit<Version, 'id'>; synced_at: number }[];
    const remote = rows.map(r => r.data).filter(v => v && typeof v.cardId === 'string' && typeof v.at === 'number');
    if (remote.length) {
      const cardIds = [...new Set(remote.map(v => v.cardId))];
      const local = await db.versions.where('cardId').anyOf(cardIds).toArray();
      const add = newVersions(local, remote);
      if (add.length) { await db.versions.bulkAdd(add as Version[]); changed = true; }
    }
    if (rows.length) {
      cur.pullVersions = Math.max(cur.pullVersions, ...rows.map(r => Number(r.synced_at) || 0));
      saveCursors(userId, cur);
    }
    if (rows.length < PAGE) break;
  }
  return changed;
}

async function syncSettings(client: SupabaseClient, userId: string, cur: Cursors): Promise<boolean> {
  const { data, error } = await client.from('settings').select('data,updated_at').eq('user_id', userId).maybeSingle();
  fail(error);
  const remote = (data?.data ?? null) as SyncedSettings | null;
  const localRow = await db.settings.get('settings');
  const local = settingsForCloud(localRow);
  const base = cur.settingsBase ?? settingsForCloud(DEFAULT_SETTINGS);
  const merged = mergeSettings(base, local, remote);
  let changed = false;

  if (!sameValue(merged, local)) {
    const next = { ...merged, key: 'settings', lastSyncAt: localRow?.lastSyncAt } as Settings;
    await db.settings.put(next);
    changed = true;
  }
  if (!remote || !sameValue(merged, remote)) {
    const { error: upErr } = await client.from('settings')
      .upsert({ user_id: userId, data: merged, updated_at: Date.now() }, { onConflict: 'user_id' });
    fail(upErr);
  }
  cur.settingsBase = merged;
  saveCursors(userId, cur);
  return changed;
}

async function upsertInBatches(client: SupabaseClient, table: string, rows: Record<string, unknown>[], ignoreDuplicates = false): Promise<void> {
  for (let i = 0; i < rows.length; i += PUSH_BATCH) {
    const { error } = await client.from(table)
      .upsert(rows.slice(i, i + PUSH_BATCH), { onConflict: 'user_id,id', ignoreDuplicates });
    fail(error);
  }
}

async function pushCards(client: SupabaseClient, userId: string, cur: Cursors, justPulled: Map<string, number>): Promise<void> {
  // Captured before reading, with a 1s margin, so a write racing this read is pushed next time.
  const snapshotAt = Date.now() - 1000;
  const changed = await db.cards.where('updatedAt').above(cur.pushAt).toArray();
  const rows = selectCardsToPush(changed, cur.pushAt, justPulled).map(c => ({ user_id: userId, ...cardToRow(c) }));
  await upsertInBatches(client, 'cards', rows);
  cur.pushAt = Math.max(cur.pushAt, snapshotAt);
  saveCursors(userId, cur);
}

async function pushDeletions(client: SupabaseClient, userId: string): Promise<void> {
  const dels = (await db.deletions.toArray()).filter(d => d.table === 'cards');
  if (!dels.length) return;
  const rows = dels.map(d => ({ user_id: userId, id: d.id, data: {}, updated_at: d.at, deleted: true }));
  await upsertInBatches(client, 'cards', rows);
  await db.transaction('rw', db.deletions, async () => {
    for (const d of dels) {
      const now = await db.deletions.get(d.id);
      if (now && now.at === d.at) await db.deletions.delete(d.id); // deleted again meanwhile? keep it
    }
  });
}

async function pushVersions(client: SupabaseClient, userId: string, cur: Cursors): Promise<void> {
  const snapshotAt = Date.now() - 1000;
  const vs = await db.versions.where('at').above(cur.versionsPushAt).toArray();
  const rows = vs.map(v => ({ user_id: userId, id: versionRowId(v), data: versionData(v), updated_at: v.at }));
  await upsertInBatches(client, 'versions', rows, true);
  cur.versionsPushAt = Math.max(cur.versionsPushAt, snapshotAt);
  saveCursors(userId, cur);
}

let lastSyncWrite = 0;

async function runSync(client: SupabaseClient, userId: string): Promise<void> {
  const cur = loadCursors(userId);
  const justPulled = new Map<string, number>();
  const a = await pullCards(client, userId, cur, justPulled);
  const b = await pullVersions(client, userId, cur);
  const c = await syncSettings(client, userId, cur);
  await pushDeletions(client, userId);
  await pushCards(client, userId, cur, justPulled);
  await pushVersions(client, userId, cur);

  const now = Date.now();
  if (a || b || c || now - lastSyncWrite > LAST_SYNC_WRITE_MS) {
    lastSyncWrite = now;
    await db.settings.update('settings', { lastSyncAt: now }); // no-op if there's no settings row
  }
}

/* ---------------- scheduling + status ---------------- */

let client: SupabaseClient | null = null;
let userId: string | null = null;
let running: Promise<void> | null = null;
let again = false;
let failures = 0;
let retryTimer: number | undefined;
let debounceTimer: number | undefined;
let intervalTimer: number | undefined;
let lastSig: string | null = null;
let wired = false;

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

function friendlyError(e: unknown): string {
  const err = e as { message?: string; code?: string; status?: number };
  const msg = String(err?.message ?? '');
  if (err?.code === '42P01' || /relation .* does not exist|schema cache/i.test(msg)) {
    return "The cloud tables aren't set up. Run supabase/schema.sql (see docs/SYNC_SETUP.md).";
  }
  if (err?.status === 401 || /jwt|token|not authenticated/i.test(msg)) return 'Your sign-in expired. Sign out and sign in again.';
  if (/fetch|network|load failed/i.test(msg)) return "Couldn't reach the cloud. Will try again.";
  return "Sync didn't finish. Will try again.";
}

async function localSignature(): Promise<string> {
  const [count, last, dels, lastV, s] = await Promise.all([
    db.cards.count(), db.cards.orderBy('updatedAt').last(), db.deletions.count(),
    db.versions.orderBy('at').last(), db.settings.get('settings'),
  ]);
  return `${count}|${last?.id}:${last?.updatedAt}|${dels}|${lastV?.at ?? 0}|${stableStringify(settingsForCloud(s))}`;
}

function clearTimer(t: number | undefined) { if (t !== undefined) window.clearTimeout(t); }

/** Runs a sync now (or right after the one in flight). Never throws. */
export function syncNow(): Promise<void> {
  if (!client || !userId) return Promise.resolve();
  if (!online()) { setSnapshot({ status: { state: 'offline' } }); return Promise.resolve(); }
  if (running) { again = true; return running; }
  clearTimer(retryTimer); retryTimer = undefined;
  const c = client, u = userId;
  running = (async () => {
    try {
      do {
        again = false;
        setSnapshot({ status: { state: 'syncing' } });
        await runSync(c, u);
      } while (again && userId === u);
      failures = 0;
      try { lastSig = await localSignature(); } catch { /* ignore */ }
      if (userId === u) setSnapshot({ status: { state: 'ok', at: Date.now() } });
    } catch (e) {
      if (userId !== u) return;
      if (!online()) { setSnapshot({ status: { state: 'offline' } }); return; }
      failures++;
      setSnapshot({ status: { state: 'error', message: friendlyError(e) } });
      retryTimer = window.setTimeout(() => { void syncNow(); }, backoffMs(failures));
    } finally {
      running = null;
    }
  })();
  return running;
}

function scheduleSoon() {
  clearTimer(debounceTimer);
  debounceTimer = window.setTimeout(() => { debounceTimer = undefined; void syncNow(); }, DEBOUNCE_MS);
}

function wireTriggers() {
  if (wired) return;
  wired = true;
  window.addEventListener('online', () => { void syncNow(); });
  window.addEventListener('offline', () => { if (userId) setSnapshot({ status: { state: 'offline' } }); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  intervalTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, INTERVAL_MS);
  // Local changes → sync 2s later. Our own pulls are filtered out by comparing signatures.
  liveQuery(localSignature).subscribe({
    next: sig => {
      if (lastSig === null) { lastSig = sig; return; }
      if (sig === lastSig) return;
      lastSig = sig;
      if (userId) scheduleSoon();
    },
    error: () => { /* never crash the app over a watcher */ },
  });
}

function accountFrom(s: Session) {
  const meta = (s.user.user_metadata ?? {}) as Record<string, unknown>;
  const name = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : null;
  return { email: s.user.email ?? null, name };
}

function onSession(session: Session | null) {
  const next = session?.user?.id ?? null;
  if (session) setSnapshot({ account: accountFrom(session) });
  if (next === userId) return;
  userId = next;
  failures = 0;
  clearTimer(retryTimer); retryTimer = undefined;
  if (!next) {
    clearTimer(debounceTimer);
    setSnapshot({ account: null, status: { state: 'off' } });
    return;
  }
  void syncNow();
}

/* ---------------- OAuth redirect handling ---------------- */

function authErrorFromUrl(): string | null {
  try {
    const q = new URLSearchParams(location.search);
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    const desc = q.get('error_description') ?? h.get('error_description') ?? q.get('error') ?? h.get('error');
    return desc ? desc.replace(/\+/g, ' ') : null;
  } catch { return null; }
}

/** Removes ?code / ?error… left by the sign-in redirect, keeping the app's #route. */
function cleanUrl(landOnMore: boolean) {
  try {
    const url = new URL(location.href);
    let dirty = false;
    for (const p of ['code', 'error', 'error_code', 'error_description', 'state']) {
      if (url.searchParams.has(p)) { url.searchParams.delete(p); dirty = true; }
    }
    if (/^#(access_token|error|refresh_token)=|&(access_token|error)=/.test(url.hash)) { url.hash = ''; dirty = true; }
    if (dirty) history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    if (landOnMore && location.hash !== '#more') location.hash = 'more';
  } catch { /* ignore */ }
}

function takeOAuthFlag(): boolean {
  try {
    const v = sessionStorage.getItem(OAUTH_FLAG) === '1';
    sessionStorage.removeItem(OAUTH_FLAG);
    return v;
  } catch { return false; }
}

/* ---------------- public API ---------------- */

let started = false;

export function startSync(): void {
  if (started) return;
  started = true;
  try {
    const configured = isConfigured();
    setSnapshot({ configured, ready: !configured, status: { state: 'off' } });
    if (configured) void boot();
  } catch {
    setSnapshot({ configured: false, ready: true, status: { state: 'off' } });
  }
}

async function boot() {
  const urlError = authErrorFromUrl();
  const fromSignIn = takeOAuthFlag();
  try {
    const c = await getClient();
    if (!c) {
      setSnapshot({
        ready: true,
        status: online() ? { state: 'error', message: "Couldn't load cloud sync. Check your connection." } : { state: 'offline' },
      });
      return;
    }
    client = c;
    // Supabase advises not to await its own calls inside this callback, so defer.
    c.auth.onAuthStateChange((_event, session) => { window.setTimeout(() => onSession(session), 0); });
    const { data } = await c.auth.getSession(); // waits for the ?code= exchange after a redirect
    cleanUrl(fromSignIn || !!urlError);
    setSnapshot({ ready: true });
    wireTriggers();
    onSession(data.session);
    if (urlError && !data.session) {
      setSnapshot({ status: { state: 'error', message: /denied|cancel/i.test(urlError) ? 'Sign-in was cancelled.' : 'Sign-in failed. Please try again.' } });
    }
  } catch {
    cleanUrl(fromSignIn);
    setSnapshot({ ready: true, status: { state: 'error', message: 'Sign-in failed. Please try again.' } });
  }
}

/** Starts Google sign-in (leaves the page; comes back to #more). */
export async function signIn(): Promise<void> {
  if (!online()) throw new Error("You're offline. Connect to the internet to sign in.");
  const c = client ?? await getClient();
  if (!c) throw new Error("Couldn't load cloud sync. Check your connection.");
  try { sessionStorage.setItem(OAUTH_FLAG, '1'); } catch { /* ignore */ }
  const { error } = await c.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw new Error("Couldn't start Google sign-in. Please try again.");
}

/**
 * Signs out on this device. With keepLocal=false the local copy is removed too — but only after
 * a last successful sync, so nothing that isn't in the cloud yet is lost.
 */
export async function signOut(keepLocal: boolean): Promise<void> {
  const c = client;
  const u = userId;
  if (!c || !u) return;
  if (!keepLocal) {
    await syncNow();
    const s = getSnapshot().status;
    if (s.state !== 'ok') {
      throw new Error("Your latest changes aren't in the cloud yet. Connect to the internet and try again, or keep the data on this device.");
    }
  }
  try { await c.auth.signOut({ scope: 'local' }); } catch { /* the local session is cleared anyway */ }
  onSession(null);
  if (!keepLocal) {
    await db.transaction('rw', [db.cards, db.versions, db.settings, db.deletions], async () => {
      syncState.applyingRemote = true;
      try {
        await db.cards.clear();
        await db.versions.clear();
        await db.deletions.clear();
        await db.settings.clear();
      } finally {
        syncState.applyingRemote = false;
      }
    });
    clearCursors(u);
    lastSig = null;
  }
}

/** For tests / hot reload. */
export function _stopTimers(): void {
  clearTimer(retryTimer); clearTimer(debounceTimer);
  if (intervalTimer !== undefined) window.clearInterval(intervalTimer);
}
