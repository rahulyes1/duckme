import { useState } from 'react';
import { CalendarClock, Layers, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { saveSettings } from '../../lib/db';
import { loadSampleData } from '../../lib/seed';
import './settings.css';

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export default function Onboarding() {
  const [salaryDay, setSalaryDay] = useState(1);
  const [busy, setBusy] = useState<null | 'sample' | 'empty'>(null);
  const [error, setError] = useState('');

  const start = async (withSample: boolean) => {
    setBusy(withSample ? 'sample' : 'empty');
    setError('');
    try {
      // Salary day first, so sample bills land on the right side of payday.
      await saveSettings({ salaryDay });
      if (withSample) await loadSampleData();
      await saveSettings({ consentAt: Date.now(), salaryDay });
    } catch {
      setError('Could not save on this device. Check that the browser allows site storage, then try again.');
      setBusy(null);
    }
  };

  return (
    <div className="set-onb">
      <div className="set-onb-card">
        <div className="set-onb-mark" aria-hidden="true"><Layers size={28} strokeWidth={2} /></div>
        <h1 className="set-onb-title">Hisaab<span>.</span></h1>
        <p className="set-onb-promise">Notes, bills, spending and investments as one stack of cards. You decide what matters.</p>

        <ul className="set-onb-points">
          <li><Layers size={20} aria-hidden="true" /><span><b>One stack.</b> Jot a note, turn it into a bill or a task when it needs a date.</span></li>
          <li><CalendarClock size={20} aria-hidden="true" /><span><b>Before or after salary.</b> See what is due before payday and what can wait.</span></li>
          <li><Wallet size={20} aria-hidden="true" /><span><b>Your order.</b> Penalties show as hints; only you rank what comes first.</span></li>
        </ul>

        <section className="set-notice" aria-labelledby="onb-data">
          <h2 id="onb-data"><ShieldCheck size={18} aria-hidden="true" /> Your data stays with you</h2>
          <ul>
            <li>Everything is stored on this device, in this browser.</li>
            <li>Nothing is sent anywhere. There is no account and no server.</li>
            <li>No SMS reading and no bank access. You type what you want to track.</li>
            <li>You can export or delete it all at any time in More → Your data.</li>
          </ul>
        </section>

        <div className="field set-onb-field">
          <label htmlFor="onb-salary">Salary day</label>
          <select id="onb-salary" className="select" value={salaryDay} onChange={e => setSalaryDay(+e.target.value)}>
            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <span className="help">The day of the month your salary is credited. Used to split bills into before and after salary.</span>
        </div>

        {error && <p className="set-err" role="alert">{error}</p>}

        <div className="set-onb-actions">
          <button type="button" className="btn primary block" disabled={!!busy} onClick={() => start(true)}>
            <Sparkles size={18} aria-hidden="true" />{busy === 'sample' ? 'Setting up…' : 'Start with sample data'}
          </button>
          <button type="button" className="btn block" disabled={!!busy} onClick={() => start(false)}>
            {busy === 'empty' ? 'Setting up…' : 'Start empty'}
          </button>
          <p className="set-small">Sample cards are labelled “Sample”. Remove them any time in More → Your data.</p>
        </div>
      </div>
    </div>
  );
}
