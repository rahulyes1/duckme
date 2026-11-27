import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { useApp } from '../../app-context';
import { saveSettings } from '../../lib/db';
import { askPermission, checkReminders, notifyState, sendTest, type NotifyState } from '../../lib/notify';
import { DEFAULT_REMINDERS } from '../../lib/reminders';
import { InfoTip } from '../../ui/InfoTip';
import type { Settings } from '../../lib/types';

const HOURS = [7, 8, 9, 10, 12, 18, 20];
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'am' : 'pm'}`;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function Toggle({ id, label, hint, on, onChange }: { id: string; label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="set-toggle" htmlFor={id}>
      <span className="set-toggle-txt"><b>{label}</b><small>{hint}</small></span>
      <input id={id} type="checkbox" role="switch" checked={on} onChange={e => onChange(e.target.checked)} />
      <span className="set-switch" aria-hidden="true" />
    </label>
  );
}

export default function RemindersSection({ settings }: { settings: Settings }) {
  const { toast } = useApp();
  const [perm, setPerm] = useState<NotifyState>(notifyState());
  const prefs = settings.reminders ?? DEFAULT_REMINDERS;
  const set = (p: Partial<typeof prefs>) => saveSettings({ reminders: { ...prefs, ...p } });

  const allow = async () => {
    const r = await askPermission();
    setPerm(r);
    if (r === 'granted') { await sendTest(); void checkReminders(); toast('Reminders are on'); }
  };

  return (
    <section className="set-sec" aria-labelledby="set-rem">
      <h2 id="set-rem" className="set-sec-title"><BellRing size={18} aria-hidden="true" />Reminders</h2>

      {perm === 'unsupported' ? (
        <p className="set-text">
          {isIOS() && !isInstalled()
            ? 'On iPhone, add Hisaab to your Home Screen first (Share → Add to Home Screen), then open it from there to turn on reminders.'
            : 'This browser cannot show notifications. Try Chrome, or install Hisaab from the menu.'}
        </p>
      ) : perm === 'denied' ? (
        <p className="set-text">Notifications are blocked for Hisaab. Allow them in your browser's site settings (tap the lock icon next to the address), then come back here.</p>
      ) : perm === 'default' ? (
        <div className="set-rem-ask">
          <p className="set-text">Bills and salary day nudges <InfoTip label="About reminders">The day before a bill is due, and on salary day. Nothing leaves your phone.</InfoTip></p>
          <button type="button" className="btn primary" onClick={allow}><BellRing size={18} aria-hidden="true" />Turn on reminders</button>
        </div>
      ) : (
        <>
          <Toggle id="rem-bills" label="Bills" hint="Day before, on the day, overdue" on={prefs.bills} onChange={v => set({ bills: v })} />
          <Toggle id="rem-salary" label="Salary day" hint="Recap and payday checklist" on={prefs.salary} onChange={v => set({ salary: v })} />
          <Toggle id="rem-expiry" label="Warranties & documents" hint="30, 7 and 1 day before expiry" on={prefs.expiry !== false} onChange={v => set({ expiry: v })} />
          <div className="field">
            <label htmlFor="rem-hour">Remind me from</label>
            <select id="rem-hour" className="select set-narrow" value={prefs.hour} onChange={e => set({ hour: +e.target.value })}>
              {HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </div>
          <p className="set-small">
            {isInstalled()
              ? 'Installed: on Android, Hisaab checks about twice a day even when closed. On iPhone, reminders come when you open the app.'
              : 'Reminders show while Hisaab is open. Install it from this screen to get them even when it is closed (Android).'}
          </p>
          <button type="button" className="btn" onClick={() => { void sendTest(); }}>Send a test</button>
        </>
      )}
    </section>
  );
}
