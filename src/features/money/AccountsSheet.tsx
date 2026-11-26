/** Add, rename and delete your bank account names and the balances you typed (settings.accounts). */
import { Check, Landmark, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../app-context';
import { updateCard } from '../../lib/actions';
import { db, getSettings, saveSettings } from '../../lib/db';
import type { Settings } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { removeAccount, renameAccount, upsertAccount, type Account } from './autopay';
import { fmtPlain, parseAmount } from './money-util';
import './autopay-staff.css';

function AccountRow({ a, i }: { a: Account; i: number }) {
  const { toast } = useApp();
  const [name, setName] = useState(a.name);
  const [bal, setBal] = useState(fmtPlain(a.balance));
  const [err, setErr] = useState('');
  const dirty = name.trim() !== a.name || (parseAmount(bal) ?? undefined) !== a.balance;

  const save = async () => {
    const n = name.trim();
    if (!n) { setErr('Give the account a name'); return; }
    const b = parseAmount(bal);
    if (bal.trim() && b === null) { setErr('Balance: use numbers only, like 25,000'); return; }
    const cur = await getSettings();
    let list = cur.accounts ?? [];
    if (n !== a.name) {
      const renamed = renameAccount(list, a.name, n);
      if (renamed === list) { setErr('You already have an account with that name'); return; }
      list = renamed;
      // Cards that debit the old name follow the rename.
      const using = await db.cards.filter(c => c.autopay?.account === a.name).toArray();
      for (const c of using) await updateCard(c.id, { autopay: { ...c.autopay, account: n } });
    }
    await saveSettings({ accounts: upsertAccount(list, n, b ?? undefined) });
    setErr('');
    toast('Account saved');
  };
  const del = async () => {
    const cur = await getSettings();
    await saveSettings({ accounts: removeAccount(cur.accounts, a.name) });
    toast(`${a.name} removed. Cards that used it keep the name.`);
  };

  const id = `acc-${i}`;
  return (
    <li className="money-ap-accrow">
      <div className="money-ap-accgrid">
        <div className="field">
          <label htmlFor={`${id}-n`}>Account name</label>
          <input id={`${id}-n`} className="input" value={name} autoComplete="off" onChange={e => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-b`}>Balance</label>
          <div className="money-rupee-input">
            <span aria-hidden="true">₹</span>
            <input id={`${id}-b`} className="input num" inputMode="decimal" autoComplete="off" placeholder="Not set" value={bal}
              aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined} onChange={e => setBal(e.target.value)} />
          </div>
        </div>
      </div>
      {err && <span className="err" id={`${id}-err`} role="alert">{err}</span>}
      <div className="money-ap-accbtns">
        <button type="button" className="btn primary" disabled={!dirty} onClick={save}><Check size={16} aria-hidden="true" /> Save</button>
        <button type="button" className="btn danger" onClick={del} aria-label={`Delete ${a.name}`}><Trash2 size={16} aria-hidden="true" /> Delete</button>
      </div>
    </li>
  );
}

export default function AccountsSheet({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: Settings }) {
  const [name, setName] = useState('');
  const [bal, setBal] = useState('');
  const [err, setErr] = useState('');
  const accounts = settings.accounts ?? [];

  const add = async () => {
    const n = name.trim();
    if (!n) { setErr('Give the account a name'); return; }
    const b = parseAmount(bal);
    if (bal.trim() && b === null) { setErr('Balance: use numbers only, like 25,000'); return; }
    const cur = await getSettings();
    if (cur.accounts?.some(a => a.name.toLowerCase() === n.toLowerCase())) { setErr('You already have an account with that name'); return; }
    await saveSettings({ accounts: upsertAccount(cur.accounts, n, b ?? undefined) });
    setName(''); setBal(''); setErr('');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Bank accounts">
      <p className="money-muted"><Landmark size={14} aria-hidden="true" /> Names and balances you type. Hisaab never connects to your bank.</p>
      {accounts.length > 0 && (
        <ul className="money-ap-accs">
          {accounts.map((a, i) => <AccountRow key={`${a.name}-${i}`} a={a} i={i} />)}
        </ul>
      )}
      <form className="money-ap-addform" onSubmit={e => { e.preventDefault(); void add(); }}>
        <h3 className="sec-label">Add an account</h3>
        <div className="money-ap-accgrid">
          <div className="field">
            <label htmlFor="acc-new-n">Account name</label>
            <input id="acc-new-n" className="input" value={name} placeholder="HDFC salary" autoComplete="off" onChange={e => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="acc-new-b">Balance (optional)</label>
            <div className="money-rupee-input">
              <span aria-hidden="true">₹</span>
              <input id="acc-new-b" className="input num" inputMode="decimal" autoComplete="off" placeholder="0" value={bal} onChange={e => setBal(e.target.value)} />
            </div>
          </div>
        </div>
        {err && <span className="err" role="alert">{err}</span>}
        <button type="submit" className="btn primary block"><Plus size={16} aria-hidden="true" /> Add account</button>
      </form>
    </Sheet>
  );
}
