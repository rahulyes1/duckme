/** Expenses tab: who owes whom from shared expenses, with a settle-up sheet (links only, no money moves). */
import { CheckCheck, ChevronRight, MessageCircle, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useApp } from '../../app-context';
import { updateCard, withUndo } from '../../lib/actions';
import { saveSettings } from '../../lib/db';
import { fmtDate, inr } from '../../lib/format';
import type { Card, Settings } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { balanceText, isUpiId, sameName, settleMessage, settleSplit, splitBalances, whatsappLink, type Balance } from './split';
import './split-review.css';

function UpiForm({ settings }: { settings: Settings }) {
  const [id, setId] = useState(settings.upiId ?? '');
  const [name, setName] = useState(settings.upiName ?? settings.userName ?? '');
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isUpiId(id)) { setErr('Enter a UPI ID like yourname@okhdfc'); return; }
    await saveSettings({ upiId: id.trim(), upiName: name.trim() || undefined });
  };
  return (
    <form className="money-sp-upi" onSubmit={submit} noValidate>
      <p className="money-muted">Add your UPI ID so the message carries a pay link. It stays on this phone.</p>
      <div className="field">
        <label htmlFor="sp-upi">Your UPI ID</label>
        <input id="sp-upi" className="input" value={id} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="yourname@okhdfc"
          aria-invalid={!!err} aria-describedby={err ? 'sp-upi-err' : undefined} onChange={e => { setId(e.target.value); setErr(''); }} />
        {err && <span className="err" id="sp-upi-err" role="alert">{err}</span>}
      </div>
      <div className="field">
        <label htmlFor="sp-upi-name">Name on the account</label>
        <input id="sp-upi-name" className="input" value={name} autoComplete="name" placeholder="Your name" onChange={e => setName(e.target.value)} />
      </div>
      <button type="submit" className="btn">Save UPI ID</button>
    </form>
  );
}

function PersonSheet({ b, settings, onClose }: { b: Balance | null; settings: Settings; onClose: () => void }) {
  return (
    <Sheet open={!!b} onClose={onClose} title={b ? `Split with ${b.name}` : 'Split'}>
      {b && <PersonBody b={b} settings={settings} onClose={onClose} />}
    </Sheet>
  );
}

function PersonBody({ b, settings, onClose }: { b: Balance; settings: Settings; onClose: () => void }) {
  const { toast, openCard } = useApp();
  const [showOld, setShowOld] = useState(false);
  const total = b.open.reduce((s, it) => s + it.amount, 0);
  const text = settleMessage(b, { id: settings.upiId, name: settings.upiName ?? settings.userName });

  const markSettled = async () => {
    const items = b.open;
    const undo = await withUndo(async () => {
      for (const it of items) {
        const c = it.card;
        if (c.split) await updateCard(c.id, { split: settleSplit(c.split, b.name) });
      }
    });
    onClose();
    toast(`Settled with ${b.name}${total ? ` · ${inr(Math.abs(total))}` : ''}`, undo);
  };

  return (
    <>
      <div className="money-sp-sheet">
        <p className={`money-sp-net ${b.net > 0 ? 'is-owed' : b.net < 0 ? 'is-owe' : ''}`}>{balanceText(b)}</p>
        {b.open.length ? (
          <ul className="money-list money-sp-items" aria-label="Shared expenses not settled yet">
            {b.open.map(it => <Item key={it.card.id} c={it.card} amount={it.amount} open={openCard} />)}
          </ul>
        ) : <p className="money-muted">Nothing open with {b.name}.</p>}

        {b.open.length > 0 && b.net > 0 && !settings.upiId && <UpiForm settings={settings} />}

        {b.settled.length > 0 && (
          <div>
            <button type="button" className="btn ghost" aria-expanded={showOld} onClick={() => setShowOld(o => !o)}>
              {showOld ? 'Hide' : 'Show'} {b.settled.length} settled earlier
            </button>
            {showOld && (
              <ul className="money-list money-sp-items is-old">
                {b.settled.map(it => <Item key={it.card.id} c={it.card} amount={it.amount} open={openCard} />)}
              </ul>
            )}
          </div>
        )}
        <p className="money-note">Hisaab only prepares the message and pay link. No money moves from here.</p>
      </div>
      {b.open.length > 0 && (
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => void markSettled()}><CheckCheck size={18} aria-hidden="true" /> Mark settled</button>
          <a className="btn primary" href={whatsappLink(text)} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={18} aria-hidden="true" /> Settle up
          </a>
        </div>
      )}
    </>
  );
}

function Item({ c, amount, open }: { c: Card; amount: number; open: (id: string, el?: Element | null) => void }) {
  return (
    <li>
      <button type="button" className="money-mini" onClick={e => open(c.id, e.currentTarget)}>
        <span className="money-mini-text">
          <span className="money-row-title">{c.title || c.category || 'Expense'}</span>
          <span className="money-sub">
            {c.date ? fmtDate(c.date) : 'No date'} · total {inr(c.amount)} · {c.split?.paidBy === 'me' ? 'you paid' : `${c.split?.paidBy} paid`}
          </span>
        </span>
        <span className={`money-row-amt num ${amount >= 0 ? 'money-sp-plus' : 'money-sp-minus'}`}>
          {amount >= 0 ? '+' : '−'}{inr(Math.abs(amount))}
        </span>
      </button>
    </li>
  );
}

export function SplitsCard({ cards, settings }: { cards: Card[]; settings: Settings }) {
  const balances = splitBalances(cards);
  const [who, setWho] = useState<string | null>(null);
  const current = who ? balances.find(b => sameName(b.name, who)) ?? null : null;
  const open = balances.filter(b => b.open.length);
  const owed = open.reduce((s, b) => s + Math.max(0, b.net), 0);
  const owe = open.reduce((s, b) => s + Math.max(0, -b.net), 0);

  return (
    <section className="money-card money-sp" aria-labelledby="e-splits">
      <h2 id="e-splits" className="money-h"><Users size={18} aria-hidden="true" /> Splits</h2>
      {open.length ? (
        <>
          <p className="money-muted num">
            {owed > 0 && <>Owed to you <b>{inr(owed)}</b></>}{owed > 0 && owe > 0 && ' · '}{owe > 0 && <>You owe <b>{inr(owe)}</b></>}
            {owed === 0 && owe === 0 && 'Everything evens out.'}
          </p>
          <ul className="money-list">
            {open.map(b => (
              <li key={b.name}>
                <button type="button" className="money-mini money-sp-row" onClick={() => setWho(b.name)}>
                  <span className="money-sp-avatar" aria-hidden="true">{b.name.slice(0, 1).toUpperCase()}</span>
                  <span className="money-mini-text">
                    <span className="money-row-title">{balanceText(b)}</span>
                    <span className="money-sub">{b.open.length} shared {b.open.length === 1 ? 'expense' : 'expenses'}</span>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="money-muted">
          {balances.length ? 'All settled. ' : ''}Tap Split when adding an expense to track who owes what with flatmates and friends.
        </p>
      )}
      <PersonSheet b={current} settings={settings} onClose={() => setWho(null)} />
    </section>
  );
}
