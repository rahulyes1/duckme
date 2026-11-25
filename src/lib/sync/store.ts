/** Tiny external store for sync + account state (read with useSyncExternalStore). */

export type SyncStatus =
  | { state: 'off' }            // not configured (no Supabase keys) or signed out
  | { state: 'syncing' }
  | { state: 'ok'; at: number }
  | { state: 'offline' }
  | { state: 'error'; message: string };

export interface Account {
  email: string | null;
  name: string | null;
}

export interface SyncSnapshot {
  /** The build has Supabase keys. */
  configured: boolean;
  /** The saved session has been checked (false only for a moment at start-up). */
  ready: boolean;
  /** Signed-in person, or null. */
  account: Account | null;
  status: SyncStatus;
}

let snap: SyncSnapshot = { configured: false, ready: false, account: null, status: { state: 'off' } };
const listeners = new Set<() => void>();

export const getSnapshot = (): SyncSnapshot => snap;

export function setSnapshot(patch: Partial<SyncSnapshot>): void {
  snap = { ...snap, ...patch };
  listeners.forEach(l => { try { l(); } catch { /* a listener must never break sync */ } });
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
