import { exportAll } from './actions';
import { saveSettings } from './db';
import { todayISO } from './format';

export type BackupResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Backup to file. On iPhone a download link is unreliable inside a Home Screen app, so the share
 * sheet ("Save to Files") is tried first; otherwise a normal download. Saves lastBackupAt on success.
 * A cancelled share sheet is "not backed up" and is not an error.
 */
export async function runBackup(): Promise<BackupResult> {
  const json = await exportAll();
  const name = `hisaab-backup-${todayISO()}.json`;
  let result: BackupResult | null = null;

  if (typeof File !== 'undefined' && typeof navigator.share === 'function') {
    const files = [new File([json], name, { type: 'application/json' })];
    if (navigator.canShare?.({ files })) {
      try {
        await navigator.share({ files, title: 'Hisaab backup' });
        result = 'shared';
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
        // Any other share failure: fall through to the download link.
      }
    }
  }

  if (!result) {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    result = 'downloaded';
  }

  await saveSettings({ lastBackupAt: Date.now() });
  return result;
}

/** Ask the browser to keep our data (not clear it under storage pressure). Safe to call on every start. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!st?.persist || !st.persisted) return null;
  try {
    if (await st.persisted()) return true;
    return await st.persist();
  } catch {
    return null;
  }
}

/** true = protected, false = may be cleared, null = this browser cannot tell. */
export async function storageIsPersisted(): Promise<boolean | null> {
  const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!st?.persisted) return null;
  try { return await st.persisted(); } catch { return null; }
}
