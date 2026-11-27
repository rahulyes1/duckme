import { Landmark, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useApp } from '../../app-context';
import { saveSettings } from '../../lib/db';
import { fmtDate, inr, today, todayISO, uid } from '../../lib/format';
import type { Goal, Loan, Settings } from '../../lib/types';
import { coinBurst } from '../../ui/fx';
import { Sheet } from '../../ui/Sheet';
import { Money } from '../../ui/bits';
import { InfoTip } from '../../ui/InfoTip';
import { emiFor, goalProgress, loanStatus, prepaySaving } from './goals';
import { parseAmount } from './money-util';
import './goals.css';

const EMOJI = ['🎯', '✈️', '🏠', '🚗', '📱', '💍', '🎓', '🛟', '🏖️', '💻'];

function Ring({ frac, done }: { frac: number; done?: boolean }) {
  const r = 22, C = 2 * Math.PI * r;
  return (
    <svg className={`gl-ring ${done ? 'is-done' : ''}`} width="54" height="54" viewBox="0 0 54 54" aria-hidden="true">
      <circle cx="27" cy="27" r={r} className="bg" />
      <circle cx="27" cy="27" r={r} className="fg" strokeDasharray={C} style={{ strokeDashoffset: C * (1 - frac) }} />
    </svg>
  );
}

function Rupee({ id, label, value, onChange, placeholder, help, err }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; help?: string; err?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="money-rupee-input">
        <span aria-hidden="true">₹</span>
        <input id={id} className="input num" inputMode="decimal" autoComplete="off" value={value} placeholder={placeholder}
          aria-invalid={!!err} onChange={e => onChange(e.target.value)}
          onBlur={e => { const n = parseAmount(e.target.value); if (n !== null) onChange(n.toLocaleString('en-IN')); }} />
      </div>
      {err ? <span className="err" role="alert">{err}</span> : help ? <span className="help">{help}</span> : null}
    </div>
  );
}

/* ---------------- goals ---------------- */

function GoalSheet({ open, goal, onClose, goals }: { open: boolean; goal: Goal | null; onClose: () => void; goals: Goal[] }) {
  const [name, setName] = useState(goal?.name ?? '');
  const [emoji, setEmoji] = useState(goal?.emoji ?? '🎯');
  const [target, setTarget] = useState(goal ? goal.target.toLocaleString('en-IN') : '');
  const [saved, setSaved] = useState(goal ? goal.saved.toLocaleString('en-IN') : '');
  const [by, setBy] = useState(goal?.by ?? '');
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = parseAmount(target), s = saved.trim() ? parseAmount(saved) : 0;
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name the goal, like Goa trip';
    if (t === null || t <= 0) errs.target = 'Enter the amount you need, like 40,000';
    if (s === null || s < 0) errs.saved = 'Enter what you have saved so far, or leave it empty';
    setErr(errs);
    if (Object.keys(errs).length) return;
    const next: Goal = { id: goal?.id ?? uid(), name: name.trim(), emoji, target: Math.round(t!), saved: Math.round(s!), by: by || undefined, createdAt: goal?.createdAt ?? Date.now() };
    await saveSettings({ goals: goal ? goals.map(g => (g.id === goal.id ? next : g)) : [...goals, next] });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={goal ? 'Edit goal' : 'New savings goal'}>
      <form onSubmit={submit} noValidate className="gl-form">
        <div className="gl-emoji" role="radiogroup" aria-label="Icon">
          {EMOJI.map(x => (
            <button key={x} type="button" role="radio" aria-checked={emoji === x} className="gl-emo" onClick={() => setEmoji(x)}>{x}</button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="gl-name">What are you saving for?</label>
          <input id="gl-name" className="input" value={name} placeholder="Goa trip, emergency fund, new phone" aria-invalid={!!err.name} onChange={e => setName(e.target.value)} />
          {err.name && <span className="err" role="alert">{err.name}</span>}
        </div>
        <Rupee id="gl-target" label="Target" value={target} onChange={setTarget} placeholder="40,000" err={err.target} />
        <Rupee id="gl-saved" label="Saved so far" value={saved} onChange={setSaved} placeholder="0" err={err.saved} />
        <div className="field">
          <label htmlFor="gl-by">By when? (optional)</label>
          <input id="gl-by" type="date" className="input num" value={by} min={todayISO()} onChange={e => setBy(e.target.value)} />
          <span className="help">Hisaab works out how much to put aside each month.</span>
        </div>
        <div className="money-sheet-actions">
          {goal && (
            <button type="button" className="btn ghost gl-del" onClick={async () => { await saveSettings({ goals: goals.filter(g => g.id !== goal.id) }); onClose(); }}>
              <Trash2 size={16} aria-hidden="true" /> Delete
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">{goal ? 'Save' : 'Add goal'}</button>
        </div>
      </form>
    </Sheet>
  );
}

function GoalCard({ g, goals, onEdit }: { g: Goal; goals: Goal[]; onEdit: () => void }) {
  const { toast } = useApp();
  const [adding, setAdding] = useState(false);
  const [amt, setAmt] = useState('');
  const p = goalProgress(g, today());

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const n = parseAmount(amt);
    if (n === null || n === 0) return;
    const saved = Math.max(0, g.saved + Math.round(n));
    await saveSettings({ goals: goals.map(x => (x.id === g.id ? { ...x, saved } : x)) });
    setAmt(''); setAdding(false);
    if (saved >= g.target && g.saved < g.target) {
      coinBurst((e.currentTarget as HTMLElement).getBoundingClientRect());
      toast(`${g.name}: goal reached!`);
    } else toast(`${n > 0 ? 'Added' : 'Took out'} ${inr(Math.abs(n))}`);
  };

  return (
    <li className={`gl-card ${p.done ? 'is-done' : ''}`}>
      <button type="button" className="gl-main" onClick={onEdit} aria-label={`Edit ${g.name}`}>
        <span className="gl-ring-wrap"><Ring frac={p.frac} done={p.done} /><span className="gl-emo-in" aria-hidden="true">{g.emoji ?? '🎯'}</span></span>
        <span className="gl-txt">
          <b>{g.name}</b>
          <span className="num">{inr(g.saved)} <i>of {inr(g.target)}</i></span>
          <small className={p.late ? 'is-late' : ''}>
            {p.done ? 'Done — well saved!'
              : p.late ? `Date passed · ${inr(p.left)} to go`
              : p.perMonth ? `${inr(p.perMonth)}/month till ${fmtDate(g.by!)}`
              : `${inr(p.left)} to go`}
          </small>
        </span>
        <span className="gl-pct num">{Math.round(p.frac * 100)}%</span>
      </button>
      {!p.done && (adding ? (
        <form className="gl-addrow" onSubmit={add}>
          <div className="money-rupee-input">
            <span aria-hidden="true">₹</span>
            <input className="input num" inputMode="decimal" autoFocus placeholder="Add (use − to take out)" value={amt} onChange={e => setAmt(e.target.value)} aria-label={`Amount to add to ${g.name}`} />
          </div>
          <button type="submit" className="btn primary">Save</button>
          <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      ) : (
        <button type="button" className="btn ghost gl-add" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" /> Add money</button>
      ))}
    </li>
  );
}

/* ---------------- loans ---------------- */

function LoanSheet({ open, loan, onClose, loans }: { open: boolean; loan: Loan | null; onClose: () => void; loans: Loan[] }) {
  const [name, setName] = useState(loan?.name ?? '');
  const [principal, setPrincipal] = useState(loan ? loan.principal.toLocaleString('en-IN') : '');
  const [rate, setRate] = useState(loan ? String(loan.rate) : '');
  const [years, setYears] = useState('');
  const [emi, setEmi] = useState(loan ? loan.emi.toLocaleString('en-IN') : '');
  const [first, setFirst] = useState(loan?.firstEmi ?? todayISO());
  const [err, setErr] = useState<Record<string, string>>({});

  const p = parseAmount(principal), r = Number(rate), y = Number(years);
  const suggested = p && r >= 0 && y > 0 ? emiFor(p, r, Math.round(y * 12)) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const em = emi.trim() ? parseAmount(emi) : suggested;
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name the loan, like Home loan';
    if (!p || p <= 0) errs.principal = 'Enter the loan amount, like 5,00,000';
    if (!(r >= 0 && r < 60) || rate.trim() === '') errs.rate = 'Enter the yearly interest rate, like 9.5';
    if (!em || em <= 0) errs.emi = 'Enter your EMI, or the tenure in years so Hisaab can work it out';
    setErr(errs);
    if (Object.keys(errs).length) return;
    const next: Loan = { id: loan?.id ?? uid(), name: name.trim(), principal: Math.round(p!), rate: r, emi: Math.round(em!), firstEmi: first, createdAt: loan?.createdAt ?? Date.now() };
    await saveSettings({ loans: loan ? loans.map(l => (l.id === loan.id ? next : l)) : [...loans, next] });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={loan ? 'Edit loan' : 'Add a loan'}>
      <form onSubmit={submit} noValidate className="gl-form">
        <div className="field">
          <label htmlFor="ln-name">Loan</label>
          <input id="ln-name" className="input" value={name} placeholder="Home loan, car loan, education loan" aria-invalid={!!err.name} onChange={e => setName(e.target.value)} />
          {err.name && <span className="err" role="alert">{err.name}</span>}
        </div>
        <Rupee id="ln-p" label="Loan amount (when it started)" value={principal} onChange={setPrincipal} placeholder="5,00,000" err={err.principal} />
        <div className="gl-two">
          <div className="field">
            <label htmlFor="ln-r">Interest % a year</label>
            <input id="ln-r" className="input num" inputMode="decimal" value={rate} placeholder="9.5" aria-invalid={!!err.rate} onChange={e => setRate(e.target.value)} />
            {err.rate && <span className="err" role="alert">{err.rate}</span>}
          </div>
          <div className="field">
            <label htmlFor="ln-y">Tenure (years)</label>
            <input id="ln-y" className="input num" inputMode="decimal" value={years} placeholder="5" onChange={e => setYears(e.target.value)} />
          </div>
        </div>
        <Rupee id="ln-emi" label="EMI" value={emi} onChange={setEmi} placeholder={suggested ? suggested.toLocaleString('en-IN') : '10,624'}
          help={suggested && !emi.trim() ? `Works out to ${inr(suggested)} a month. Leave empty to use it.` : 'From your loan statement.'} err={err.emi} />
        <div className="field">
          <label htmlFor="ln-first">First EMI date</label>
          <input id="ln-first" type="date" className="input num" value={first} onChange={e => setFirst(e.target.value)} />
        </div>
        <div className="money-sheet-actions">
          {loan && (
            <button type="button" className="btn ghost gl-del" onClick={async () => { await saveSettings({ loans: loans.filter(l => l.id !== loan.id) }); onClose(); }}>
              <Trash2 size={16} aria-hidden="true" /> Delete
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">{loan ? 'Save' : 'Add loan'}</button>
        </div>
      </form>
    </Sheet>
  );
}

function LoanCard({ l, onEdit }: { l: Loan; onEdit: () => void }) {
  const ref = today();
  const s = loanStatus(l, ref);
  const [pre, setPre] = useState('');
  const preN = parseAmount(pre) ?? 0;
  const save = preN > 0 ? prepaySaving(l, preN, ref) : null;
  const yrs = (m: number) => (m < 12 ? `${m}m` : m % 12 ? `${Math.floor(m / 12)}y ${m % 12}m` : `${m / 12}y`);

  return (
    <li className="gl-card ln-card">
      <button type="button" className="gl-main" onClick={onEdit} aria-label={`Edit ${l.name}`}>
        <span className="ln-ic" aria-hidden="true"><Landmark size={20} /></span>
        <span className="gl-txt">
          <b>{l.name}</b>
          <span className="num">{inr(s.outstanding)} <i>left of {inr(l.principal)}</i></span>
          <small>
            {s.outstanding === 0 ? 'Fully repaid'
              : !isFinite(s.monthsLeft) ? 'EMI is below the monthly interest — check the numbers'
              : `${inr(l.emi)} EMI · ${yrs(s.monthsLeft)} left · ends ${s.endISO ? fmtDate(s.endISO) : ''}`}
          </small>
        </span>
      </button>
      <div className="ln-bar" aria-hidden="true"><i style={{ width: `${Math.round(s.frac * 100)}%` }} /></div>
      {isFinite(s.interestLeft) && s.outstanding > 0 && (
        <div className="ln-foot">
          <span>Interest left <b className="num">{inr(s.interestLeft)}</b></span>
          <label className="ln-pre">
            <span>If I prepay</span>
            <span className="money-rupee-input"><span aria-hidden="true">₹</span>
              <input className="input num" inputMode="decimal" placeholder="1,00,000" value={pre} onChange={e => setPre(e.target.value)} aria-label={`Prepay amount for ${l.name}`} />
            </span>
          </label>
          {save && save.months > 0 && (
            <p className="ln-save">Saves <b className="num">{inr(save.interest)}</b> interest and ends <b>{yrs(save.months)}</b> sooner (same EMI).</p>
          )}
        </div>
      )}
    </li>
  );
}

/* ---------------- tab ---------------- */

export default function GoalsTab({ settings }: { settings: Settings }) {
  const goals = settings.goals ?? [];
  const loans = settings.loans ?? [];
  const [goalSheet, setGoalSheet] = useState<{ open: boolean; goal: Goal | null; n: number }>({ open: false, goal: null, n: 0 });
  const [loanSheet, setLoanSheet] = useState<{ open: boolean; loan: Loan | null; n: number }>({ open: false, loan: null, n: 0 });
  const openGoal = (goal: Goal | null) => setGoalSheet(s => ({ open: true, goal, n: s.n + 1 }));
  const openLoan = (loan: Loan | null) => setLoanSheet(s => ({ open: true, loan, n: s.n + 1 }));

  const savedAll = goals.reduce((s, g) => s + g.saved, 0);
  const owed = loans.reduce((s, l) => s + loanStatus(l, today()).outstanding, 0);
  const emiAll = loans.filter(l => loanStatus(l, today()).outstanding > 0).reduce((s, l) => s + l.emi, 0);

  return (
    <div className="gl">
      <section className="money-summary" aria-label="Goals and loans">
        <div>
          <span className="money-k">Saved for goals</span>
          <Money value={savedAll} className="money-big" />
          <span className="money-vs num">{loans.length ? `${inr(owed)} loan left · ${inr(emiAll)}/mo EMI` : `${goals.length} ${goals.length === 1 ? 'goal' : 'goals'}`}</span>
        </div>
      </section>
      <section className="money-card gl-sec" aria-labelledby="gl-h">
        <header className="gl-h">
          <h2 id="gl-h"><PiggyBank size={18} aria-hidden="true" /> Savings goals</h2>
        </header>
        {goals.length ? (
          <ul className="gl-list">{goals.map(g => <GoalCard key={g.id} g={g} goals={goals} onEdit={() => openGoal(g)} />)}</ul>
        ) : (
          <p className="money-muted">Trip, phone, emergency fund <InfoTip label="How goals work">Set a target and a date; Hisaab shows what to put aside each month.</InfoTip></p>
        )}
        <button type="button" className="btn gl-new" onClick={() => openGoal(null)}><Plus size={16} aria-hidden="true" /> New goal</button>
      </section>

      <section className="money-card gl-sec" aria-labelledby="ln-h">
        <header className="gl-h">
          <h2 id="ln-h"><Landmark size={18} aria-hidden="true" /> Loans &amp; EMIs</h2>
          {loans.length > 0 && <span className="num gl-sum">{inr(emiAll)}/month</span>}
        </header>
        {loans.length ? (
          <>
            <ul className="gl-list">{loans.map(l => <LoanCard key={l.id} l={l} onEdit={() => openLoan(l)} />)}</ul>
            <p className="money-muted num">Owed <b>{inr(owed)}</b></p>
          </>
        ) : (
          <p className="money-muted">Home, car, education loan <InfoTip label="How loans work">See what's left, when it ends, and what a prepayment saves.</InfoTip></p>
        )}
        <button type="button" className="btn gl-new" onClick={() => openLoan(null)}><Plus size={16} aria-hidden="true" /> Add loan</button>
      </section>

      <GoalSheet key={`g${goalSheet.n}`} open={goalSheet.open} goal={goalSheet.goal} goals={goals} onClose={() => setGoalSheet(s => ({ ...s, open: false }))} />
      <LoanSheet key={`l${loanSheet.n}`} open={loanSheet.open} loan={loanSheet.loan} loans={loans} onClose={() => setLoanSheet(s => ({ ...s, open: false }))} />
    </div>
  );
}
