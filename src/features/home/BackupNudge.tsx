import { useState } from 'react';
import { X } from 'lucide-react';
import type { Settings } from '../../lib/types';
import { useApp } from '../../app-context';
import { runBackup } from '../../lib/backup';
import { backupNudge, backupNudgeText, NUDGE_DISMISS_KEY } from '../../lib/backup-logic';

function readDismissed(): number | undefined {
  try { const v = Number(localStorage.getItem(NUDGE_DISMISS_KEY)); return v > 0 ? v : undefined; } catch { return undefined; }
}

/** A quiet line on Home when the last backup is old. It never backs up by itself. */
export function BackupNudge({ cardCount, settings }: { cardCount: number; settings: Settings }) {
  const { toast } = useApp();
  const [dismissedAt, setDismissedAt] = useState(readDismissed);
  const { show, days } = backupNudge({ cardCount, lastBackupAt: settings.lastBackupAt, dismissedAt, now: Date.now() });
  if (!show) return null;

  const dismiss = () => {
    const now = Date.now();
    try { localStorage.setItem(NUDGE_DISMISS_KEY, String(now)); } catch { /* private mode: hide for this visit only */ }
    setDismissedAt(now);
  };
  const backup = async () => {
    try {
      const r = await runBackup();
      if (r !== 'cancelled') toast(r === 'shared' ? 'Backup ready. Keep the file somewhere safe.' : 'Backup saved');
    } catch {
      toast('Could not make the backup. Try again.');
    }
  };

  return (
    <div className="home-hint home-backup" role="note">
      <span className="num">{backupNudgeText(days)} · <button type="button" className="home-backup-go" onClick={backup}>Back up now</button></span>
      <button type="button" className="icon-btn" aria-label="Hide backup reminder for a day" onClick={dismiss}><X size={18} aria-hidden="true" /></button>
    </div>
  );
}
