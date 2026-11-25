// Account + cloud sync, at the top of More. Works (and explains itself) with no Supabase keys.
import { useEffect, useState } from 'react';
import { AlertCircle, Cloud, CloudOff, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { useApp } from '../../app-context';
import { signIn, signOut, syncNow, useSyncAccount, type SyncStatus } from '../../lib/sync';

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function StatusLine({ status, now }: { status: SyncStatus; now: number }) {
  switch (status.state) {
    case 'syncing': return <><RefreshCw size={16} aria-hidden="true" className="set-acct-spin" />Syncing…</>;
    case 'ok': return <><Cloud size={16} aria-hidden="true" />Synced {ago(status.at, now)}</>;
    case 'offline': return <><CloudOff size={16} aria-hidden="true" />Offline — will sync when back online</>;
    case 'error': return <><AlertCircle size={16} aria-hidden="true" />{status.message}</>;
    default: return <>Not syncing</>;
  }
}

export default function AccountSection() {
  const { toast } = useApp();
  const { configured, ready, account, status } = useSyncAccount();
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [asking, setAsking] = useState(false);

  const title = (
    <h2 id="set-acct-title" className="set-sec-title">
      {configured ? <Cloud size={20} aria-hidden="true" /> : <CloudOff size={20} aria-hidden="true" />}Account &amp; sync
    </h2>
  );

  if (!configured) {
    return (
      <section className="set-sec" aria-labelledby="set-acct-title">
        {title}
        <div className="set-stack">
          <p className="set-text">Cloud sync isn't set up yet</p>
          <p className="set-small">
            Everything stays on this device and works fully offline. To use Hisaab on your phone and laptop together,
            cloud sync has to be switched on once by whoever deploys the app (steps in docs/SYNC_SETUP.md).
          </p>
        </div>
      </section>
    );
  }

  const doSignIn = async () => {
    setErr(''); setBusy(true);
    try { await signIn(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  const doSignOut = async (keepLocal: boolean) => {
    setErr(''); setBusy(true);
    try {
      await signOut(keepLocal);
      setAsking(false);
      toast(keepLocal ? 'Signed out. Your data is still on this device.' : 'Signed out and removed the copy on this device.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <section className="set-sec" aria-labelledby="set-acct-title" aria-busy="true">
        {title}
        <p className="set-small" role="status">Checking sign-in…</p>
      </section>
    );
  }

  if (!account) {
    return (
      <section className="set-sec" aria-labelledby="set-acct-title">
        {title}
        <div className="set-stack">
          <p className="set-text">Sign in with Google to use Hisaab on all your devices</p>
          <p className="set-small">Your data stays on this device too, and the app keeps working offline.</p>
          <div className="set-btnrow">
            <button type="button" className="btn primary" onClick={doSignIn} disabled={busy}>
              <LogIn size={18} aria-hidden="true" />{busy ? 'Opening Google…' : 'Sign in with Google'}
            </button>
          </div>
          <div aria-live="polite">
            {(err || status.state === 'error') && <p className="set-err">{err || (status.state === 'error' ? status.message : '')}</p>}
          </div>
        </div>
      </section>
    );
  }

  const initial = (account.name || account.email || '?').trim().charAt(0).toUpperCase();
  const syncing = status.state === 'syncing';

  return (
    <section className="set-sec" aria-labelledby="set-acct-title">
      {title}
      <div className="set-acct-who">
        <span className="set-acct-avatar" aria-hidden="true">{initial}</span>
        <div className="set-acct-id">
          {account.name && <p className="set-text set-acct-name">{account.name}</p>}
          <p className={account.name ? 'set-small set-acct-email' : 'set-text set-acct-email'}>{account.email ?? 'Signed in'}</p>
        </div>
      </div>

      <p className={`set-acct-status${status.state === 'error' ? ' is-error' : ''}`} role="status" aria-live="polite">
        <StatusLine status={status} now={now} />
      </p>

      {!asking ? (
        <div className="set-btnrow">
          <button type="button" className="btn" onClick={() => { void syncNow(); }} disabled={syncing || busy}>
            <RefreshCw size={18} aria-hidden="true" />{status.state === 'error' ? 'Try again' : 'Sync now'}
          </button>
          <button type="button" className="btn ghost" onClick={() => { setErr(''); setAsking(true); }} disabled={busy}>
            <LogOut size={18} aria-hidden="true" />Sign out
          </button>
        </div>
      ) : (
        <div className="set-acct-ask" role="group" aria-labelledby="set-acct-ask-q">
          <p id="set-acct-ask-q" className="set-text"><b>Keep data on this device?</b></p>
          <p className="set-small">Keeping it means you can still use Hisaab here offline. Your cloud copy stays either way.</p>
          <div className="set-btnrow">
            <button type="button" className="btn primary" onClick={() => doSignOut(true)} disabled={busy} autoFocus>
              Keep on this device
            </button>
            <button type="button" className="btn danger" onClick={() => doSignOut(false)} disabled={busy}>
              Remove local copy
            </button>
            <button type="button" className="btn ghost" onClick={() => { setAsking(false); setErr(''); }} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div aria-live="assertive">{err && <p className="set-err">{err}</p>}</div>
    </section>
  );
}
