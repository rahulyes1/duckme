import { useState, type FormEvent } from 'react';
import { Delete, Lock } from 'lucide-react';
import { sha256 } from '../../lib/format';

/** PIN entry shown inside the editor before a locked note opens. */
export function PinPad({ pinHash, onUnlock }: { pinHash: string; onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  const tryPin = async (value: string, explicit: boolean) => {
    if (value.length >= 4 && (await sha256(value)) === pinHash) { onUnlock(); return; }
    if (explicit) { setErr(value.length < 4 ? 'Enter 4 to 6 digits.' : 'Wrong PIN. Try again.'); setPin(''); }
  };

  const set = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 6);
    setPin(clean);
    setErr('');
    void tryPin(clean, false);
  };

  const submit = (e: FormEvent) => { e.preventDefault(); void tryPin(pin, true); };

  return (
    <form className="notes-pin" onSubmit={submit}>
      <Lock size={32} aria-hidden="true" className="notes-pin-ico" />
      <h2 className="notes-pin-title">This note is locked</h2>
      <div className="field">
        <label htmlFor="notes-pin-input">Enter your PIN</label>
        <input
          id="notes-pin-input"
          className="input notes-pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={6}
          autoFocus
          value={pin}
          aria-invalid={!!err}
          aria-describedby={err ? 'notes-pin-err' : undefined}
          onChange={e => set(e.target.value)}
        />
        {err && <div id="notes-pin-err" className="err" role="alert">{err}</div>}
      </div>
      <div className="notes-keys" aria-label="Number pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button key={d} type="button" className="notes-key" onClick={() => set(pin + d)}>{d}</button>
        ))}
        <button type="button" className="notes-key" aria-label="Delete last digit" onClick={() => set(pin.slice(0, -1))}>
          <Delete size={22} aria-hidden="true" />
        </button>
        <button type="button" className="notes-key" onClick={() => set(pin + '0')}>0</button>
        <button type="submit" className="notes-key notes-key-go">Unlock</button>
      </div>
    </form>
  );
}
