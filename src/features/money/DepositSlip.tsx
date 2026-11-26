/**
 * "Deposit slip": adding an investment the passbook way. Pick the kind, fill only what that kind needs,
 * and see what it's worth today as you type (live NAV for funds, live gold price, FD/RD interest by date).
 */
import { useEffect, useMemo, useState } from 'react';
import { Coins, Landmark, LineChart, PiggyBank, Repeat, Search, Shield, Sparkles, TrendingUp } from 'lucide-react';
import { useApp } from '../../app-context';
import { createCard } from '../../lib/actions';
import { fmtDate, inr, toISO, todayISO } from '../../lib/format';
import type { Card, InvestKind } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { addMonthsISO, fdValue, goldValue, ppfProjection, rdValue, sipFutureValue } from './invest-math';
import { parseAmount } from './money-util';
import { goldPerGram, latestNav, navOn, searchFunds, type Scheme } from './prices';
import './passbook.css';

type Kind = 'mf' | 'sip' | 'FD' | 'RD' | 'PPF' | 'Gold' | 'Stock' | 'NPS';
const KINDS: { k: Kind; label: string; hint: string; Icon: typeof Coins }[] = [
  { k: 'sip', label: 'SIP', hint: 'Monthly fund', Icon: Repeat },
  { k: 'mf', label: 'Mutual fund', hint: 'Lump sum', Icon: LineChart },
  { k: 'FD', label: 'FD', hint: 'Fixed deposit', Icon: Landmark },
  { k: 'RD', label: 'RD', hint: 'Monthly deposit', Icon: PiggyBank },
  { k: 'PPF', label: 'PPF', hint: '15 years, tax-free', Icon: Shield },
  { k: 'Gold', label: 'Gold', hint: 'By grams', Icon: Coins },
  { k: 'Stock', label: 'Stocks', hint: 'Shares', Icon: TrendingUp },
  { k: 'NPS', label: 'NPS', hint: 'Pension', Icon: Sparkles },
];

const num = (s: string) => { const n = parseAmount(s); return n === null ? NaN : n; };
const blurFmt = (set: (v: string) => void) => (e: React.FocusEvent<HTMLInputElement>) => { const n = parseAmount(e.target.value); if (n !== null) set(n.toLocaleString('en-IN')); };

function Rupee({ id, label, v, set, ph, help }: { id: string; label: string; v: string; set: (s: string) => void; ph?: string; help?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="money-rupee-input"><span aria-hidden="true">₹</span>
        <input id={id} className="input num" inputMode="decimal" autoComplete="off" value={v} placeholder={ph} onChange={e => set(e.target.value)} onBlur={blurFmt(set)} />
      </div>
      {help && <span className="help">{help}</span>}
    </div>
  );
}
function Field({ id, label, v, set, ph, type = 'text', mode, help }: { id: string; label: string; v: string; set: (s: string) => void; ph?: string; type?: string; mode?: 'decimal' | 'numeric'; help?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input num" type={type} inputMode={mode} value={v} placeholder={ph} onChange={e => set(e.target.value)} />
      {help && <span className="help">{help}</span>}
    </div>
  );
}

function FundPicker({ picked, onPick }: { picked: Scheme | null; onPick: (s: Scheme | null) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Scheme[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (picked || q.trim().length < 3) { setRes([]); return; }
    const t = setTimeout(async () => {
      setBusy(true); setErr('');
      try { setRes(await searchFunds(q)); } catch { setErr('Could not search funds right now. Check your connection.'); }
      finally { setBusy(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q, picked]);

  if (picked) {
    return (
      <div className="ds-fund">
        <span className="ds-fund-name">{picked.schemeName}</span>
        <button type="button" className="btn ghost" onClick={() => { onPick(null); setQ(''); }}>Change</button>
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor="ds-fund">Fund</label>
      <div className="ds-search"><Search size={16} aria-hidden="true" />
        <input id="ds-fund" className="input" autoComplete="off" value={q} placeholder="Type a fund name, like parag parikh flexi" onChange={e => setQ(e.target.value)} />
      </div>
      {busy && <span className="help">Searching…</span>}
      {err && <span className="err" role="alert">{err}</span>}
      {res.length > 0 && (
        <ul className="ds-results" role="listbox" aria-label="Funds">
          {res.map(s => (
            <li key={s.schemeCode}><button type="button" role="option" aria-selected="false" onClick={() => onPick(s)}>{s.schemeName}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DepositSlip({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useApp();
  const [kind, setKind] = useState<Kind | null>(null);
  const [name, setName] = useState('');
  const [fund, setFund] = useState<Scheme | null>(null);
  const [nav, setNav] = useState<{ nav: number; date: string } | null>(null);
  const [amt, setAmt] = useState('');
  const [units, setUnits] = useState('');
  const [invested, setInvested] = useState('');
  const [value, setValue] = useState('');
  const [rate, setRate] = useState('');
  const [start, setStart] = useState(todayISO());
  const [months, setMonths] = useState('12');
  const [sipDay, setSipDay] = useState('5');
  const [grams, setGrams] = useState('');
  const [purity, setPurity] = useState<24 | 22 | 18>(22);
  const [gold, setGold] = useState<number | null>(null);
  const [buyNav, setBuyNav] = useState<number | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { if (open) { setKind(null); setErr(''); } }, [open]);
  useEffect(() => { if (kind === 'PPF') setRate(r => r || '7.1'); if (kind === 'FD' || kind === 'RD') setRate(r => r || '7'); }, [kind]);
  useEffect(() => { if (fund) void latestNav(fund.schemeCode).then(setNav); else setNav(null); }, [fund]);
  useEffect(() => { if (kind === 'Gold' && gold === null) void goldPerGram().then(setGold); }, [kind, gold]);
  // Lump sum: NAV on the purchase date gives units.
  useEffect(() => {
    if (kind !== 'mf' || !fund || !start) { setBuyNav(null); return; }
    let live = true;
    void navOn(fund.schemeCode, start).then(r => { if (live) setBuyNav(r?.nav ?? null); });
    return () => { live = false; };
  }, [kind, fund, start]);

  const today = todayISO();
  const maturity = (kind === 'FD' || kind === 'RD') && start && +months > 0 ? addMonthsISO(start, +months) : undefined;
  const a = num(amt), r = parseFloat(rate);

  const preview = useMemo(() => {
    if (kind === 'mf' && nav) {
      const u = units ? num(units) : buyNav && a ? a / buyNav : NaN;
      if (u > 0) return { now: Math.round(u * nav.nav), note: `${u.toFixed(3)} units × NAV ₹${nav.nav.toFixed(2)} (${fmtDate(nav.date)})`, units: u };
    }
    if (kind === 'sip') {
      const u = num(units);
      if (nav && u > 0) return { now: Math.round(u * nav.nav), note: `${u.toFixed(3)} units × NAV ₹${nav.nav.toFixed(2)} (${fmtDate(nav.date)})`, units: u };
      if (a > 0) return { now: null, note: `In 10 years at 12%: about ${inr(sipFutureValue(a, 12, 120))}` };
    }
    if (kind === 'FD' && a > 0 && r > 0 && maturity) return { now: fdValue(a, r, start, maturity, today), note: `Matures ${fmtDate(maturity)} at ${inr(fdValue(a, r, start, maturity, maturity))}` };
    if (kind === 'RD' && a > 0 && r > 0 && maturity) {
      const at = rdValue(a, r, start, maturity, maturity);
      return { now: rdValue(a, r, start, maturity, today).value, note: `${at.count} deposits of ${inr(a)} → ${inr(at.value)} on ${fmtDate(maturity)}` };
    }
    if (kind === 'PPF') { const bal = num(value) || 0, y = num(amt) || 0; if (bal || y) return { now: bal || null, note: `At ${r || 7.1}% for 15 years: about ${inr(ppfProjection(bal, y, r || 7.1, 15))}` }; }
    if (kind === 'Gold' && num(grams) > 0 && gold) return { now: goldValue(num(grams), purity, gold), note: `${grams} g × ${purity}K at ~₹${gold.toLocaleString('en-IN')}/g (24K) + 8% retail` };
    return null;
  }, [kind, nav, units, buyNav, a, r, maturity, start, today, value, amt, grams, purity, gold]);

  const save = async () => {
    setErr('');
    const ik: InvestKind = kind === 'sip' ? 'SIP' : kind === 'mf' ? 'MF' : kind === 'Gold' ? 'Gold' : kind === 'Stock' ? 'Stock' : (kind as InvestKind);
    const title = (fund?.schemeName.split(' - ')[0] ?? name.trim()) || ({ FD: 'Fixed deposit', RD: 'Recurring deposit', PPF: 'PPF', Gold: 'Gold', NPS: 'NPS', Stock: 'Stocks' } as Record<string, string>)[kind ?? ''] || 'Investment';
    const base: Partial<Card> & { type: 'invest' } = { type: 'invest', title, color: 'mint' };
    let invest: NonNullable<Card['invest']> = { kind: ik };
    if (kind === 'mf' || kind === 'sip') {
      if (!fund) { setErr('Pick a fund from the search first.'); return; }
      const u = preview && 'units' in preview ? preview.units : undefined;
      if (kind === 'mf' && !(a > 0) && !(u && u > 0)) { setErr('Enter the amount you invested, or your units.'); return; }
      if (kind === 'sip' && !(a > 0)) { setErr('Enter your monthly SIP amount.'); return; }
      const next = (() => { const d = new Date(); const day = Math.min(28, Math.max(1, +sipDay || 5)); const n = new Date(d.getFullYear(), d.getMonth() + (d.getDate() >= day ? 1 : 0), day); return toISO(n); })();
      invest = { ...invest, schemeCode: fund.schemeCode, schemeName: fund.schemeName, units: u, nav: nav?.nav, navDate: nav?.date, value: preview?.now ?? undefined, invested: kind === 'mf' ? (a > 0 ? a : undefined) : (num(invested) || undefined), start, next: kind === 'sip' ? next : undefined, autoAt: Date.now() };
      base.amount = a > 0 ? a : undefined;
    } else if (kind === 'FD' || kind === 'RD') {
      if (!(a > 0) || !(r > 0) || !maturity) { setErr('Enter the amount, interest rate and how many months.'); return; }
      invest = { ...invest, rate: r, start, maturity, value: preview?.now ?? undefined, invested: kind === 'FD' ? a : rdValue(a, r, start, maturity, today).paid, next: kind === 'RD' ? addMonthsISO(start, rdValue(a, r, start, maturity, today).count) : undefined, autoAt: Date.now() };
      base.amount = a;
    } else if (kind === 'PPF') {
      invest = { ...invest, rate: r || 7.1, value: num(value) || undefined, invested: num(invested) || num(value) || undefined, maturity: addMonthsISO(start, 180), start };
      base.amount = num(amt) || undefined;
    } else if (kind === 'Gold') {
      if (!(num(grams) > 0)) { setErr('Enter how many grams.'); return; }
      invest = { ...invest, grams: num(grams), purity, value: preview?.now ?? undefined, invested: num(invested) || undefined, autoAt: Date.now() };
      base.amount = num(invested) || undefined;
    } else {
      if (!(num(value) > 0) && !(num(invested) > 0)) { setErr('Enter what you invested and what it is worth now.'); return; }
      invest = { ...invest, value: num(value) || undefined, invested: num(invested) || undefined };
      base.amount = num(invested) || undefined;
    }
    await createCard({ ...base, invest });
    toast(`${title} added to your investments`);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Deposit slip">
      <div className="ds">
        {!kind ? (
          <>
            <p className="money-muted">What are you adding?</p>
            <div className="ds-kinds">
              {KINDS.map(({ k, label, hint, Icon }) => (
                <button key={k} type="button" className="ds-kind" onClick={() => setKind(k)}>
                  <Icon size={20} aria-hidden="true" /><b>{label}</b><small>{hint}</small>
                </button>
              ))}
            </div>
          </>
        ) : (
          <form className="ds-form" onSubmit={e => { e.preventDefault(); void save(); }} noValidate>
            <button type="button" className="ds-back" onClick={() => setKind(null)}>← {KINDS.find(x => x.k === kind)?.label}</button>

            {(kind === 'mf' || kind === 'sip') && <FundPicker picked={fund} onPick={setFund} />}
            {fund && nav && <p className="help num">Latest NAV ₹{nav.nav.toFixed(2)} on {fmtDate(nav.date)}</p>}

            {kind === 'sip' && (<>
              <div className="gl-two">
                <Rupee id="ds-a" label="Monthly SIP" v={amt} set={setAmt} ph="5,000" />
                <Field id="ds-day" label="SIP date" v={sipDay} set={setSipDay} mode="numeric" ph="5" help="Day of the month" />
              </div>
              <div className="gl-two">
                <Field id="ds-u" label="Units you hold now" v={units} set={setUnits} mode="decimal" ph="Optional" help="From your app or statement" />
                <Rupee id="ds-inv" label="Invested so far" v={invested} set={setInvested} ph="Optional" />
              </div>
            </>)}
            {kind === 'mf' && (<>
              <div className="gl-two">
                <Rupee id="ds-a" label="Amount invested" v={amt} set={setAmt} ph="50,000" />
                <Field id="ds-d" label="On" type="date" v={start} set={setStart} />
              </div>
              <Field id="ds-u" label="Or units (if you know them)" v={units} set={setUnits} mode="decimal" ph="Optional" help={buyNav ? `NAV that day: ₹${buyNav.toFixed(2)}` : undefined} />
            </>)}
            {(kind === 'FD' || kind === 'RD') && (<>
              <Field id="ds-n" label="Bank (optional)" v={name} set={setName} ph="SBI, HDFC…" />
              <div className="gl-two">
                <Rupee id="ds-a" label={kind === 'FD' ? 'Amount' : 'Every month'} v={amt} set={setAmt} ph={kind === 'FD' ? '1,00,000' : '5,000'} />
                <Field id="ds-r" label="Interest % a year" v={rate} set={setRate} mode="decimal" />
              </div>
              <div className="gl-two">
                <Field id="ds-d" label="Started on" type="date" v={start} set={setStart} />
                <Field id="ds-m" label="Months" v={months} set={setMonths} mode="numeric" />
              </div>
            </>)}
            {kind === 'PPF' && (<>
              <div className="gl-two">
                <Rupee id="ds-v" label="Balance now" v={value} set={setValue} ph="2,40,000" />
                <Rupee id="ds-a" label="You add each year" v={amt} set={setAmt} ph="1,50,000" help="Max ₹1.5 lakh" />
              </div>
              <div className="gl-two">
                <Field id="ds-r" label="Interest %" v={rate} set={setRate} mode="decimal" />
                <Field id="ds-d" label="Account opened" type="date" v={start} set={setStart} />
              </div>
            </>)}
            {kind === 'Gold' && (<>
              <Field id="ds-n" label="What (optional)" v={name} set={setName} ph="Chain, coins, SGB, digital gold" />
              <div className="gl-two">
                <Field id="ds-g" label="Grams" v={grams} set={setGrams} mode="decimal" ph="10" />
                <div className="field"><span className="ds-lbl">Purity</span>
                  <div className="chips">{([24, 22, 18] as const).map(p => <button key={p} type="button" className="chip" aria-pressed={purity === p} onClick={() => setPurity(p)}>{p}K</button>)}</div>
                </div>
              </div>
              <Rupee id="ds-inv" label="You paid (optional)" v={invested} set={setInvested} ph="For gain / loss" />
              {gold === null && <span className="help">Getting today's gold price…</span>}
            </>)}
            {(kind === 'Stock' || kind === 'NPS') && (<>
              <Field id="ds-n" label="Name" v={name} set={setName} ph={kind === 'Stock' ? 'Zerodha holdings, Infosys…' : 'NPS Tier 1'} />
              <div className="gl-two">
                <Rupee id="ds-inv" label="Invested" v={invested} set={setInvested} />
                <Rupee id="ds-v" label="Worth now" v={value} set={setValue} />
              </div>
            </>)}

            {preview && (
              <div className="ds-worth" aria-live="polite">
                {preview.now !== null && <><span className="pb-k">Worth today</span><b className="pb-big num">{inr(preview.now)}</b></>}
                <small>{preview.note}</small>
              </div>
            )}
            {err && <p className="err" role="alert">{err}</p>}
            <div className="money-sheet-actions">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn primary">Add to passbook</button>
            </div>
          </form>
        )}
      </div>
    </Sheet>
  );
}
