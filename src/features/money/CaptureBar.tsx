/**
 * The quick ways in, above the number pad: paste a bank SMS, say it, or tap one of your usual spends.
 * Nothing is read without you tapping: the clipboard is read only on "Paste SMS", the mic only on "Speak".
 */
import { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, Mic, MicOff, Repeat } from 'lucide-react';
import { inr } from '../../lib/format';
import { parseBankSms, parseSpoken, usualSpends, type Usual } from '../../lib/capture';
import type { Card } from '../../lib/types';

export interface Fill { amount?: number | null; category?: string | null; mode?: string | null; title?: string; date?: string | null; from: 'sms' | 'voice' | 'usual' }

type Rec = { lang: string; interimResults: boolean; maxAlternatives: number; start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const SpeechRec = (): (new () => Rec) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function CaptureBar({ cards, onFill, onError }: { cards: Card[]; onFill: (f: Fill) => void; onError: (msg: string) => void }) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const recRef = useRef<Rec | null>(null);
  const usual: Usual[] = usualSpends(cards, new Date());
  const canSpeak = !!SpeechRec();

  useEffect(() => () => recRef.current?.abort(), []);
  useEffect(() => {
    try { if (sessionStorage.getItem('hisaab.quickSpend.sms')) { sessionStorage.removeItem('hisaab.quickSpend.sms'); setPasteOpen(true); } } catch { /* storage blocked */ }
  }, []);

  const useSms = (raw: string): boolean => {
    const s = parseBankSms(raw);
    if (!s) return false;
    onFill({ amount: s.amount, category: s.category, mode: s.mode, title: s.merchant, date: s.date, from: 'sms' });
    setPasteOpen(false); setText('');
    return true;
  };

  const paste = async () => {
    try {
      const clip = await navigator.clipboard?.readText?.();
      if (clip && useSms(clip)) return;
    } catch { /* clipboard blocked: fall back to a box */ }
    setPasteOpen(true);
  };

  const speak = () => {
    const R = SpeechRec();
    if (!R) return;
    if (listening) { recRef.current?.stop(); return; }
    const rec = new R();
    rec.lang = 'en-IN'; rec.interimResults = true; rec.maxAlternatives = 1;
    let last = '';
    rec.onresult = e => { last = Array.from(e.results).map(r => r[0].transcript).join(' '); setHeard(last); };
    rec.onerror = e => { if (e.error !== 'aborted' && e.error !== 'no-speech') onError(e.error === 'not-allowed' ? 'Allow the microphone to speak a spend.' : 'Could not hear that. Try again.'); };
    rec.onend = () => {
      setListening(false);
      if (!last.trim()) return;
      const s = parseSpoken(last);
      if (!s.amount) { onError(`Heard “${last}” but no amount. Try “250 auto”.`); return; }
      onFill({ amount: s.amount, category: s.category, mode: s.mode, title: s.title, from: 'voice' });
      setTimeout(() => setHeard(''), 2500);
    };
    recRef.current = rec;
    setHeard(''); setListening(true);
    rec.start();
  };

  return (
    <div className="qe-cap">
      <div className="qe-cap-row">
        <button type="button" className="qe-cap-btn" onClick={paste}><ClipboardPaste size={16} aria-hidden="true" /> Paste SMS</button>
        {canSpeak && (
          <button type="button" className={`qe-cap-btn ${listening ? 'is-on' : ''}`} aria-pressed={listening} onClick={speak}>
            {listening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}{listening ? 'Listening… tap to stop' : 'Speak'}
          </button>
        )}
      </div>
      {heard && <p className="qe-heard" aria-live="polite">“{heard}”</p>}
      {pasteOpen && (
        <div className="qe-paste">
          <label htmlFor="qe-sms" className="sr-only">Bank or UPI SMS</label>
          <textarea id="qe-sms" className="input" rows={3} autoFocus value={text} placeholder="Paste the bank or UPI SMS here"
            onChange={e => {
              // A paste lands many characters at once: read it straight away. Typing waits for "Read SMS".
              const v = e.target.value, pasted = v.length - text.length > 15;
              setText(v);
              if (pasted) useSms(v);
            }} />
          <div className="qe-paste-foot">
            <span className="help">{text.length > 20 && !parseBankSms(text) ? 'No spend found yet. It needs an amount like Rs.250 and a word like debited or sent.' : 'Works with HDFC, ICICI, SBI, Axis, Kotak and UPI apps.'}</span>
            <button type="button" className="btn" disabled={!parseBankSms(text)} onClick={() => useSms(text)}>Read SMS</button>
          </div>
        </div>
      )}
      {usual.length > 0 && (
        <div className="qe-usual" role="group" aria-label="Your usual spends">
          <Repeat size={14} aria-hidden="true" />
          {usual.map(u => (
            <button key={u.title + u.amount} type="button" className="chip"
              onClick={() => onFill({ amount: u.amount, category: u.category, mode: u.mode, title: u.title, from: 'usual' })}>
              {u.title} <b className="num">{inr(u.amount)}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
