/**
 * "How much did you pay?" for credit-card bills. A card bill is a transfer (your card spends already
 * counted), and people often pay part of it or on another day, so we ask once — prefilled with the
 * bill amount and today, one tap on Confirm keeps it fast.
 *
 * Any UI path calls `payBillAsking(bill)`; <CardPayHost /> (mounted once in App) shows the sheet.
 */
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { payBill, type PayOpts } from '../../lib/actions';
import { inr, todayISO } from '../../lib/format';
import { isCardBill } from '../../lib/logic';
import type { Card } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { fmtPlain, parseAmount } from './money-util';
import './cardpay.css';

type Ask = { bill: Card; resolve: (v: PayOpts | null) => void };
const EVT = 'hisaab:cardpay';

/** Opens the sheet and resolves with what you paid, or null if you closed it. */
export function askCardPayment(bill: Card): Promise<PayOpts | null> {
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent<Ask>(EVT, { detail: { bill, resolve } }));
  });
}

/** Pays a bill; for a credit-card bill asks the amount and date first. Null when you cancelled. */
export async function payBillAsking(bill: Card): Promise<Awaited<ReturnType<typeof payBill>> | null> {
  if (!isCardBill(bill)) return payBill(bill.id);
  const opts = await askCardPayment(bill);
  return opts ? payBill(bill.id, opts) : null;
}

export function CardPayHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [raw, setRaw] = useState('');
  const [date, setDate] = useState(todayISO());
  const [err, setErr] = useState('');

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Ask>).detail;
      setAsk(prev => { prev?.resolve(null); return d; });
      setRaw(fmtPlain(d.bill.amount));
      setDate(todayISO());
      setErr('');
    };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);

  const close = () => { ask?.resolve(null); setAsk(null); };
  const confirm = () => {
    if (!ask) return;
    const amount = parseAmount(raw);
    if (amount === null || amount <= 0) { setErr('Type the amount you paid, like 4,500.'); return; }
    if (!date) { setErr('Pick the day you paid.'); return; }
    ask.resolve({ amount, date });
    setAsk(null);
  };
  const bill = ask?.bill;
  const amt = parseAmount(raw);
  const part = bill?.amount && amt !== null && amt > 0 && amt < bill.amount ? bill.amount - amt : 0;

  return (
    <Sheet open={!!ask} onClose={close} title="How much did you pay?">
      {bill && (
        <form className="money-cardpay" onSubmit={e => { e.preventDefault(); confirm(); }} noValidate>
          <p className="money-muted">
            {bill.title || 'Card bill'}{bill.amount ? <> · bill <span className="num">{inr(bill.amount)}</span></> : null}.
            {' '}Paying a card bill moves money to the card — your card spends already counted, so this isn't a new spend.
          </p>
          <div className="field">
            <label htmlFor="cp-amt">Amount paid</label>
            <input id="cp-amt" className="input num" inputMode="decimal" autoComplete="off" value={raw}
              aria-invalid={!!err && (amt === null || amt <= 0)} aria-describedby={err ? 'cp-err' : part ? 'cp-part' : undefined}
              onChange={e => { setRaw(e.target.value); setErr(''); }}
              onBlur={() => { const v = parseAmount(raw); if (v !== null) setRaw(fmtPlain(v)); }} />
            {part > 0 && !err && <small id="cp-part" className="help num">{inr(part)} still on the card</small>}
          </div>
          <div className="field">
            <label htmlFor="cp-date">Paid on</label>
            <input id="cp-date" className="input" type="date" value={date} max={todayISO()} onChange={e => { setDate(e.target.value); setErr(''); }} />
          </div>
          {err && <p id="cp-err" className="field err" role="alert">{err}</p>}
          <div className="money-cardpay-actions">
            <button type="button" className="btn ghost" onClick={close}>Cancel</button>
            <button type="submit" className="btn primary" data-autofocus><Check size={16} aria-hidden="true" /> Confirm</button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
