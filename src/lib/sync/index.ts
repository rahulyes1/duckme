// CONTRACT STUB — implemented by the Sync agent. Keep these exports stable.
export type SyncStatus =
  | { state: 'off' }            // not configured (no Supabase keys) or signed out
  | { state: 'syncing' }
  | { state: 'ok'; at: number }
  | { state: 'offline' }
  | { state: 'error'; message: string };

/** Called once from main.tsx. Restores the session and starts background sync if signed in. */
export function startSync(): void {}

/** Live sync status for the UI. */
export function useSyncStatus(): SyncStatus {
  return { state: 'off' };
}
