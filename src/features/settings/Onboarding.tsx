import { useState } from 'react';
import { CalendarClock, Layers, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { saveSettings } from '../../lib/db';
import { loadSampleData } from '../../lib/seed';
import { parseAmount } from '../money/money-util';
import './settings.css';

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export default function Onboarding() {
  const [name, setName] = useState('');
  const [salary, setSalary] = useState('');
  const [salaryDay, setSalaryDay] = useState(1);
  const [busy, setBusy] = useState<null | 'sample' | 'empty'>(null);
  const [error, setError] = useState('');

  const start = async (withSample: boolean) => {
    setBusy(withSample ? 'sample' : 'empty');
    setError('');
    try {
      const amt = parseAmount(salary);
      // Salary day first, so sample bills land on the right side of payday.
      await saveSettings({ salaryDay, userName: name.trim() || undefined, salaryAmount: amt && amt > 0 ? Math.round(amt) : undefined });
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
        <div className="set-onb-mark onb-in" aria-hidden="true"><Layers size={28} strokeWidth={2} /></div>
        <h1 className="set-onb-title onb-in" style={{ animationDelay: '60ms' }}>Hisaab<span>.</span></h1>
        <p className="set-onb-promise onb-in" style={{ animationDelay: '120ms' }}>Your notes, bills, spending and plans in one calm place.</p>

        <ul className="set-onb-points">
          <li className="onb-in" style={{ animationDelay: '180ms' }}><Wallet size={20} aria-hidden="true" /><span><b>Safe to spend today.</b> One number that tells you how much you can spend until salary.</span></li>
          <li className="onb-in" style={{ animationDelay: '230ms' }}><CalendarClock size={20} aria-hidden="true" /><span><b>Bills before payday.</b> See what's due before salary and what can wait.</span></li>
          <li className="onb-in" style={{ animationDelay: '280ms' }}><Layers size={20} aria-hidden="true" /><span><b>Notes that do things.</b> A note becomes a task, a bill or a priority when it needs to.</span></li>
        </ul>

        <form className="set-onb-form onb-in" style={{ animationDelay: '340ms' }} onSubmit={e => { e.preventDefault(); void start(false); }}>
          <div className="field">
            <label htmlFor="onb-name">Your first name</label>
            <input id="onb-name" className="input" autoComplete="given-name" value={name} onChange={e => setName(e.target.value)} placeholder="For the greeting" />
          </div>
          <div className="set-onb-two">
            <div className="field">
              <label htmlFor="onb-amt">Monthly take-home</label>
              <div className="money-rupee-input">
                <span aria-hidden="true">₹</span>
                <input id="onb-amt" className="input num" inputMode="decimal" autoComplete="off" value={salary} placeholder="65,000"
                  onChange={e => setSalary(e.target.value)}
                  onBlur={e => { const n = parseAmount(e.target.value); if (n !== null) setSalary(n.toLocaleString('en-IN')); }} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="onb-salary">Salary day</label>
              <select id="onb-salary" className="select num" value={salaryDay} onChange={e => setSalaryDay(+e.target.value)}>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <span className="help">Optional. Used only on this device to work out what's safe to spend each day. Change it any time in Money.</span>
        </form>

        <section className="set-notice onb-in" style={{ animationDelay: '400ms' }} aria-labelledby="onb-data">
          <h2 id="onb-data"><ShieldCheck size={18} aria-hidden="true" /> Your data stays yours</h2>
          <ul>
            <li>Saved in this browser first, and works offline.</li>
            <li>Sign in with Google (optional) to sync your devices. Only your account can read it.</li>
            <li>No SMS reading, no bank access, no ads. Export or delete everything any time.</li>
          </ul>
        </section>

        {error && <p className="set-err" role="alert">{error}</p>}

        <div className="set-onb-actions onb-in" style={{ animationDelay: '460ms' }}>
          <button type="button" className="btn primary block" disabled={!!busy} onClick={() => start(false)}>
            {busy === 'empty' ? 'Setting up…' : 'Start'}
          </button>
          <button type="button" className="btn block" disabled={!!busy} onClick={() => start(true)}>
            <Sparkles size={18} aria-hidden="true" />{busy === 'sample' ? 'Setting up…' : 'Try it with sample data'}
          </button>
          <p className="set-small">Already use Hisaab on another device? Tap Start, then sign in from More to bring your cards here.</p>
        </div>
      </div>
    </div>
  );
}
