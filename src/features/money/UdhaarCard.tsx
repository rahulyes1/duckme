import { useMemo, useState, type FormEvent } from 'react';
import { CheckCheck, ChevronRight, HandCoins, MessageCircle, Plus } from 'lucide-react';
import { useApp } from '../../app-context';
import { saveSettings } from '../../lib/db';
import { fmtDate, inr, todayISO, uid } from '../../lib/format';
import type { Card, Settings, UdhaarEntry } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { parseAmount } from './money-util';
import { cleanName, knownPeople, sameName, whatsappLink } from './split';
import { settleAll, udhaarMessage, udhaarPeople, udhaarTotals, type UdhaarPerson } from './udhaar';

function AddSheet({ open, onClose, settings, people }: { open: boolean; onClose: () => void; settings: Settings; people: string[] }) {
  const { toast } = useApp();
  const [dir, setDir] = useState<'lent' | 'borrowed'>('lent');
  const [name, setName] = useState('');
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseAmount(amt);
    const errs: Record<string, string> = {};
    if (!cleanName(name)) errs.name = 'Who is it? Type a name, like Ravi';
    if (n === null || n <= 0) errs.amt = 'Enter the amount, like 2,000';
    setErr(errs);
    if (Object.keys(errs).length) return;
    const entry: UdhaarEntry = { id: uid(), name: cleanName(name), dir, amount: Math.round(n! * 100) / 100, note: note.trim() || undefined, date, createdAt: Date.now() };
    await saveSettings({ udhaar: [...(settings.udhaar ?? []), entry] });
    toast(dir === 'lent' ? `Noted: ${entry.name} owes you ${inr(entry.amount)}` : `Noted: you owe ${entry.name} ${inr(entry.amount)}`);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add udhaar">
      <form className="gl-form" onSubmit={submit} noValidate>
        <div className="ud-dir" role="radiogroup" aria-label="Direction">
          <button type="button" role="radio" aria-checked={dir === 'lent'} onClick={() => setDir('lent')}>I lent</button>
          <button type="button" role="radio" aria-checked={dir === 'borrowed'} onClick={() => setDir('borrowed')}>I borrowed</button>
        </div>
        <div className="field">
          <label htmlFor="ud-name">{dir === 'lent' ? 'To' : 'From'}</label>
          <input id="ud-name" className="input" value={name} placeholder="Name" autoComplete="off" aria-invalid={!!err.name} onChange={e => setName(e.target.value)} />
          {people.length > 0 && (
            <div className="chips ud-people">
              {people.slice(0, 8).map(p => <button key={p} type="button" className="chip" aria-pressed={sameName(p, name)} onClick={() => setName(p)}>{p}</button>)}
            </div>
          )}
          {err.name && <span className="err" role="alert">{err.name}</span>}
        </div>
        <div className="field">
          <label htmlFor="ud-amt">Amount</label>
          <div className="money-rupee-input"><span aria-hidden="true">₹</span>
            <input id="ud-amt" className="input num" inputMode="decimal" value={amt} placeholder="2,000" aria-invalid={!!err.amt}
              onChange={e => setAmt(e.target.value)} onBlur={e => { const n = parseAmount(e.target.value); if (n !== null) setAmt(n.toLocaleString('en-IN')); }} />
          </div>
          {err.amt && <span className="err" role="alert">{err.amt}</span>}
        </div>
        <div className="gl-two">
          <div className="field"><label htmlFor="ud-note">For (optional)</label><input id="ud-note" className="input" value={note} placeholder="Train tickets" onChange={e => setNote(e.target.value)} /></div>
          <div className="field"><label htmlFor="ud-date">When</label><input id="ud-date" type="date" className="input num" value={date} max={todayISO()} onChange={e => setDate(e.target.value)} /></div>
        </div>
        <div className="money-sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">Save</button>
        </div>
      </form>
    </Sheet>
  );
}

function PersonSheet({ p, settings, onClose }: { p: UdhaarPerson | null; settings: Settings; onClose: () => void }) {
  const { toast } = useApp();
  if (!p) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const text = udhaarMessage(p, { id: settings.upiId, name: settings.upiName ?? settings.userName });
  const settle = async () => {
    await saveSettings({ udhaar: settleAll(settings.udhaar ?? [], p.name, Date.now()) });
    toast(`All square with ${p.name}`);
    onClose();
  };
  return (
    <Sheet open={!!p} onClose={onClose} title={p.name}>
      <p className={`money-sp-net ${p.net > 0 ? 'is-owed' : p.net < 0 ? 'is-owe' : ''}`}>
        {p.net > 0 ? `${p.name} owes you ${inr(p.net)}` : p.net < 0 ? `You owe ${p.name} ${inr(-p.net)}` : `All square with ${p.name}`}
      </p>
      <ul className="money-list ud-items">
        {p.open.map(e => (
          <li key={e.id} className="ud-item">
            <span><b>{e.dir === 'lent' ? 'You lent' : 'You borrowed'}</b>{e.note ? ` · ${e.note}` : ''}<small className="num">{fmtDate(e.date)}</small></span>
            <b className={`num ${e.dir === 'lent' ? 'money-sp-plus' : 'money-sp-minus'}`}>{e.dir === 'lent' ? '+' : '−'}{inr(e.amount)}</b>
          </li>
        ))}
      </ul>
      {!settings.upiId && p.net > 0 && <p className="money-muted">Tip: save your UPI ID in Splits so reminders include a tap-to-pay link.</p>}
      <div className="money-sheet-actions">
        <button type="button" className="btn" onClick={() => void settle()}><CheckCheck size={18} aria-hidden="true" /> Settled</button>
        <a className="btn primary" href={whatsappLink(text)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" /> {p.net > 0 ? 'Remind on WhatsApp' : 'Message'}</a>
      </div>
    </Sheet>
  );
}

/** Money lent and borrowed, person by person. Sits next to Splits in Expenses. */
export function UdhaarCard({ cards, settings }: { cards: Card[]; settings: Settings }) {
  const people = useMemo(() => udhaarPeople(settings.udhaar ?? []), [settings.udhaar]);
  const open = people.filter(p => p.open.length);
  const t = udhaarTotals(open);
  const [adding, setAdding] = useState<{ open: boolean; n: number }>({ open: false, n: 0 });
  const [who, setWho] = useState<string | null>(null);
  const current = who ? people.find(p => sameName(p.name, who)) ?? null : null;
  const names = useMemo(() => {
    const out = [...people.map(p => p.name)];
    for (const n of knownPeople(settings.splitPeople, cards)) if (!out.some(x => sameName(x, n))) out.push(n);
    return out;
  }, [people, settings.splitPeople, cards]);

  return (
    <section className="money-card ud" aria-labelledby="ud-h">
      <div className="money-h-row">
        <h2 id="ud-h" className="money-h"><HandCoins size={18} aria-hidden="true" /> Udhaar</h2>
        <button type="button" className="btn ghost" onClick={() => setAdding(a => ({ open: true, n: a.n + 1 }))}><Plus size={16} aria-hidden="true" /> Add</button>
      </div>
      {open.length ? (
        <>
          <p className="money-muted num">
            {t.owedToMe > 0 && <>Owed to you <b>{inr(t.owedToMe)}</b></>}{t.owedToMe > 0 && t.iOwe > 0 && ' · '}{t.iOwe > 0 && <>You owe <b>{inr(t.iOwe)}</b></>}
          </p>
          <ul className="money-list">
            {open.map(p => (
              <li key={p.name}>
                <button type="button" className="money-mini money-sp-row" onClick={() => setWho(p.name)}>
                  <span className={`money-sp-avatar ${p.net < 0 ? 'is-owe' : ''}`} aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
                  <span className="money-mini-text">
                    <span className="money-row-title">{p.net > 0 ? `${p.name} owes you` : `You owe ${p.name}`}</span>
                    <span className="money-sub num">since {p.since ? fmtDate(p.since) : ''} · {p.open.length} {p.open.length === 1 ? 'entry' : 'entries'}</span>
                  </span>
                  <b className={`num ${p.net > 0 ? 'money-sp-plus' : 'money-sp-minus'}`}>{inr(Math.abs(p.net))}</b>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="money-muted">Lent someone money, or borrowed some? Note it here and send a friendly WhatsApp reminder when it's time.</p>
      )}
      <AddSheet key={adding.n} open={adding.open} onClose={() => setAdding(a => ({ ...a, open: false }))} settings={settings} people={names} />
      <PersonSheet p={current} settings={settings} onClose={() => setWho(null)} />
    </section>
  );
}
