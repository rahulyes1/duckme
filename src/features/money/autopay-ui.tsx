/** Autopay register (Bills tab) and the autopay fields in the entry editor. Values are typed by you; no bank access. */
import { AlertTriangle, CheckCircle2, CircleHelp, Clock, Landmark, Pencil, Plus, Settings2, TrendingUp, Receipt } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app-context';
import { getSettings, saveSettings } from '../../lib/db';
import { addDaysISO, fmtDayMonth, inr, todayISO } from '../../lib/format';
import type { AutopayInfo, Card, Settings } from '../../lib/types';
import { Switch } from '../../ui/bits';
import AccountsSheet from './AccountsSheet';
import { accountRegister, NO_ACCOUNT, upsertAccount, type AccountSummary } from './autopay';
import { fmtPlain, parseAmount } from './money-util';
import './autopay-staff.css';

/* ---------- small shared rupee input ---------- */

export function RupeeField({ id, label, value, onValue, help, autoFocus, allowZero = true }: {
  id: string; label: string; value: number | undefined; onValue: (n: number | undefined) => void; help?: string; autoFocus?: boolean; allowZero?: boolean;
}) {
  const [text, setText] = useState(() => fmtPlain(value));
  const [err, setErr] = useState('');
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(fmtPlain(value)); }, [value]);
  const desc = [help ? `${id}-help` : '', err ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="money-rupee-input">
        <span aria-hidden="true">₹</span>
        <input id={id} className="input num" inputMode="decimal" autoComplete="off" placeholder="0" value={text}
          data-autofocus={autoFocus ? '' : undefined} aria-invalid={!!err} aria-describedby={desc}
          onFocus={() => { focused.current = true; }}
          onChange={e => {
            const raw = e.target.value;
            setText(raw);
            const n = parseAmount(raw);
            if (!raw.trim()) { setErr(''); onValue(undefined); return; }
            if (n === null) return;
            if (!allowZero && n <= 0) return;
            setErr('');
            onValue(n);
          }}
          onBlur={e => {
            focused.current = false;
            const raw = e.target.value;
            const n = parseAmount(raw);
            if (raw.trim() && n === null) setErr('Use numbers only, like 1,250');
            else if (raw.trim() && !allowZero && n !== null && n <= 0) setErr('Amount must be more than ₹0');
            else { setErr(''); if (n !== null) setText(fmtPlain(n)); }
          }} />
      </div>
      {help && <span className="help" id={`${id}-help`}>{help}</span>}
      {err && <span className="err" id={`${id}-err`} role="alert">{err}</span>}
    </div>
  );
}

/* ---------- editor: autopay switch + fields ---------- */

/** Autopay switch for bills and investments. Shows the bank account chips and the mandate cap when on. */
export function AutopayFields({ card, settings, onChange }: { card: Card; settings: Settings; onChange: (v: AutopayInfo | undefined) => void }) {
  const ap = card.autopay;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const accounts = settings.accounts ?? [];
  const names = accounts.map(a => a.name);
  if (ap?.account && !names.includes(ap.account)) names.push(ap.account);
  const id = `ap-${card.id}`;

  const addAccount = async () => {
    const n = name.trim();
    if (!n) return;
    const cur = await getSettings();
    await saveSettings({ accounts: upsertAccount(cur.accounts, n, cur.accounts?.find(a => a.name.toLowerCase() === n.toLowerCase())?.balance) });
    onChange({ ...ap, account: n });
    setName('');
    setAdding(false);
  };

  return (
    <div className="money-ap-fields">
      <div className="money-switches">
        <Switch checked={!!ap} label="Autopay (UPI autopay, NACH or card standing instruction)"
          onChange={v => onChange(v ? { account: accounts[0]?.name } : undefined)} />
      </div>
      {ap && (
        <div className="money-ap-reveal">
          <div className="field">
            <span className="label" id={`${id}-acc`}>Bank account it debits</span>
            <div className="money-chips" role="group" aria-labelledby={`${id}-acc`}>
              {names.map(n => (
                <button key={n} type="button" className="chip" aria-pressed={ap.account === n} onClick={() => onChange({ ...ap, account: n })}>
                  <Landmark size={14} aria-hidden="true" /> {n}
                </button>
              ))}
              {!adding && (
                <button type="button" className="chip money-ap-addchip" onClick={() => setAdding(true)}>
                  <Plus size={14} aria-hidden="true" /> Add account
                </button>
              )}
            </div>
            {adding && (
              <form className="money-ap-inline" onSubmit={e => { e.preventDefault(); void addAccount(); }}>
                <label htmlFor={`${id}-new`} className="sr-only">New account name</label>
                <input id={`${id}-new`} className="input" value={name} placeholder="HDFC salary" autoComplete="off" autoFocus
                  onChange={e => setName(e.target.value)} />
                <button type="submit" className="btn primary" disabled={!name.trim()}>Add</button>
                <button type="button" className="btn ghost" onClick={() => { setAdding(false); setName(''); }}>Cancel</button>
              </form>
            )}
          </div>
          <RupeeField id={`${id}-cap`} label="Mandate cap" value={ap.cap}
            help="The most this mandate may debit at once. Leave empty if you don't know."
            onValue={n => onChange({ ...ap, cap: n })} />
          {ap.cap !== undefined && (card.amount ?? 0) > ap.cap && (
            <p className="money-ap-flag" role="status">
              <AlertTriangle size={16} aria-hidden="true" /> {inr(card.amount)} is above the {inr(ap.cap)} cap — it may fail.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Bills tab: register ---------- */

function BalanceEdit({ s }: { s: AccountSummary }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const id = `bal-${s.account.replace(/\W+/g, '-')}`;
  if (s.account === NO_ACCOUNT) return null;

  const save = async () => {
    const n = parseAmount(text);
    if (text.trim() && n === null) { setErr('Use numbers only, like 25,000'); return; }
    const cur = await getSettings();
    await saveSettings({ accounts: upsertAccount(cur.accounts, s.account, n ?? undefined) });
    setErr('');
    setEditing(false);
  };

  if (!editing) {
    return (
      <button type="button" className="money-ap-bal" onClick={() => { setText(fmtPlain(s.balance)); setEditing(true); }}
        aria-label={s.balance === undefined ? `Add balance for ${s.account}` : `Balance ${inr(s.balance)} in ${s.account}, edit`}>
        <span className="money-k">Balance you typed</span>
        <span className="num money-ap-bal-v">{s.balance === undefined ? 'Add balance' : inr(s.balance)} <Pencil size={14} aria-hidden="true" /></span>
      </button>
    );
  }
  return (
    <form className="money-ap-balform" onSubmit={e => { e.preventDefault(); void save(); }}>
      <label htmlFor={id} className="money-k">Balance in {s.account}</label>
      <div className="money-ap-inline">
        <div className="money-rupee-input">
          <span aria-hidden="true">₹</span>
          <input id={id} className="input num" inputMode="decimal" autoComplete="off" autoFocus value={text} placeholder="0"
            aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }} />
        </div>
        <button type="submit" className="btn primary">Save</button>
        <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
      </div>
      {err && <span className="err" id={`${id}-err`} role="alert">{err}</span>}
    </form>
  );
}

function Status({ s }: { s: AccountSummary }) {
  if (!s.debits.length) return <p className="money-ap-status ok"><CheckCircle2 size={16} aria-hidden="true" /> Nothing leaves this account in the next 7 days.</p>;
  if (s.account === NO_ACCOUNT) return <p className="money-ap-status unknown"><CircleHelp size={16} aria-hidden="true" /> Pick an account in each card to check the balance.</p>;
  if (s.status === 'ok') return <p className="money-ap-status ok"><CheckCircle2 size={16} aria-hidden="true" /> OK — the balance covers it.</p>;
  if (s.status === 'short') return <p className="money-ap-status short"><AlertTriangle size={16} aria-hidden="true" /> Short by <b className="num">{inr(s.shortBy)}</b> — top up before the first debit.</p>;
  return <p className="money-ap-status unknown"><CircleHelp size={16} aria-hidden="true" /> Add balance to check if it covers {inr(s.total)}.</p>;
}

function AccountBlock({ s }: { s: AccountSummary }) {
  const { openCard } = useApp();
  return (
    <li className={`money-ap-acc is-${s.debits.length ? s.status : 'ok'}`}>
      <div className="money-ap-acc-top">
        <div className="money-ap-acc-name">
          <span className="money-ico" aria-hidden="true"><Landmark size={18} /></span>
          <span>
            <span className="money-row-title">{s.account}</span>
            <span className="money-sub">Next 7 days: <b className="num">{inr(s.total)}</b> leaves {s.account === NO_ACCOUNT ? 'unassigned accounts' : s.account}</span>
          </span>
        </div>
        <BalanceEdit s={s} />
      </div>
      <Status s={s} />
      {s.debits.length > 0 && (
        <ul className="money-ap-debits">
          {s.debits.map((d, n) => (
            <li key={`${d.card.id}-${d.date}-${n}`}>
              <button type="button" className="money-ap-debit" onClick={e => openCard(d.card.id, e.currentTarget)}>
                <span className="num money-ap-date">{fmtDayMonth(d.date)}</span>
                <span className="money-ap-dname">
                  {d.kind === 'sip' ? <TrendingUp size={14} aria-hidden="true" /> : <Receipt size={14} aria-hidden="true" />}
                  {d.card.title || 'Untitled'}{d.projected ? <span className="money-muted"> · expected</span> : null}
                </span>
                <span className="num money-row-amt">{inr(d.amount)}</span>
              </button>
              {d.overCap && (
                <p className="money-ap-flag"><AlertTriangle size={14} aria-hidden="true" /> {inr(d.amount)} is above the {inr(d.cap)} cap — it may fail.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function AutopayRegister({ cards, settings }: { cards: Card[]; settings: Settings }) {
  const [sheet, setSheet] = useState(false);
  const from = todayISO();
  const to = addDaysISO(from, 7);
  const reg = useMemo(() => accountRegister(cards, settings.accounts, from, to), [cards, settings.accounts, from, to]);
  const hasAutopay = cards.some(c => !!c.autopay && (c.type === 'bill' || c.type === 'invest'));
  const shortCount = reg.filter(r => r.debits.length && r.status === 'short').length;

  return (
    <section className="money-card money-wide money-ap" aria-labelledby="b-ap">
      <div className="money-h-row">
        <h2 id="b-ap" className="money-h">Autopay &amp; mandates</h2>
        <button type="button" className="btn ghost money-ap-manage" onClick={() => setSheet(true)}>
          <Settings2 size={16} aria-hidden="true" /> Accounts
        </button>
      </div>
      {shortCount > 0 && (
        <p className="money-ap-status short" role="status"><AlertTriangle size={16} aria-hidden="true" /> {shortCount === 1 ? '1 account is' : `${shortCount} accounts are`} short for the next 7 days.</p>
      )}
      {!hasAutopay && !reg.length ? (
        <p className="money-muted">No autopay yet. Open a bill or SIP and turn on "Autopay" to see what leaves each account in the next 7 days.</p>
      ) : (
        <ul className="money-ap-list">{reg.map(s => <AccountBlock key={s.account} s={s} />)}</ul>
      )}
      <p className="money-note money-ap-npci">
        <Clock size={14} aria-hidden="true" /> UPI autopay and NACH debits usually run outside peak hours, and the bank may try up to 4 times. Keep the money in from the day before.
      </p>
      <AccountsSheet open={sheet} onClose={() => setSheet(false)} settings={settings} />
    </section>
  );
}
