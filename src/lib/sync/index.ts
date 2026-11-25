// Public sync API. main.tsx calls startSync(); the UI reads useSyncStatus() / useSyncAccount().
import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe, type SyncSnapshot, type SyncStatus } from './store';

export type { SyncStatus, SyncSnapshot, Account } from './store';
export { startSync, syncNow, signIn, signOut } from './engine';
export { isConfigured } from './client';

/** Live sync status for the UI. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).status;
}

/** Live account + sync state (configured, signed-in person, status). */
export function useSyncAccount(): SyncSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
