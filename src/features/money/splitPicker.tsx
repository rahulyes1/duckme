/** Split editor inside quick expense: pick people, equal or custom shares, who paid. */
import { Plus, RotateCcw, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { saveSettings } from '../../lib/db';
import { inr } from '../../lib/format';
import { fmtPlain, parseAmount } from './money-util';
import { cleanName, equalShares, ME, myShare, sameName, type SplitDraft } from './split';
import './split-review.css';

export const EMPTY_SPLIT: SplitDraft = { people: [], custom: null, paidBy: ME };

export function SplitPicker({ amount, draft, onChange, known, saved, error }: {
  amount: number;
  draft: SplitDraft;
  onChange: (d: SplitDraft) => void;
  /** Names to offer as chips. */
  known: string[];
  /** settings.splitPeople, so new names can be remembered. */
  saved: string[] | undefined;
  error?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [texts, setTexts] = useState<Record<string, string>>({});

  const names = [...known];
  for (const p of draft.people) if (!names.some(n => sameName(n, p))) names.push(p);
  const eq = equalShares(amount, draft.people);
  const shareOf = (n: string) => draft.custom?.[n] ?? eq.people.find(p => p.name === n)?.share ?? 0;
  const mine = myShare(amount, { paidBy: ME, people: draft.people.map(n => ({ name: n, share: shareOf(n), settled: false })) });

  const toggle = (n: string) => {
    const on = draft.people.some(p => sameName(p, n));
    const people = on ? draft.people.filter(p => !sameName(p, n)) : [...draft.people, n];
    let custom = draft.custom;
    if (on && custom) { custom = { ...custom }; delete custom[n]; if (!Object.keys(custom).length) custom = null; }
    const paidBy = on && sameName(draft.paidBy, n) ? ME : draft.paidBy;
    if (on) setTexts(t => { const c = { ...t }; delete c[n]; return c; });
    onChange({ people, custom, paidBy });
  };

  const add = async () => {
    const n = cleanName(name);
    if (!n) { setNameErr('Type a name'); return; }
    if (sameName(n, ME) || sameName(n, 'you')) { setNameErr('You are already in the split'); return; }
    if (!draft.people.some(p => sameName(p, n))) onChange({ ...draft, people: [...draft.people, n] });
    if (!(saved ?? []).some(s => sameName(s, n))) await saveSettings({ splitPeople: [...(saved ?? []), n] });
    setName(''); setNameErr(''); setAdding(false);
  };

  const setShare = (n: string, raw: string) => {
    setTexts(t => ({ ...t, [n]: raw }));
    const v = parseAmount(raw);
    onChange({ ...draft, custom: { ...(draft.custom ?? {}), [n]: v ?? 0 } });
  };
  const resetEqual = () => { setTexts({}); onChange({ ...draft, custom: null }); };

  return (
    <div className="money-sp-edit">
      <div className="chips money-sp-chips" role="group" aria-label="Split with">
        {names.map(n => (
          <button key={n} type="button" className="chip" aria-pressed={draft.people.some(p => sameName(p, n))} onClick={() => toggle(n)}>{n}</button>
        ))}
        {!adding && (
          <button type="button" className="chip" onClick={() => { setAdding(true); setTimeout(() => document.getElementById('sp-new')?.focus(), 30); }}>
            <UserPlus size={16} aria-hidden="true" /> Add name
          </button>
        )}
      </div>

      {adding && (
        <div className="money-sp-add">
          <div className="field">
            <label htmlFor="sp-new">Friend's name</label>
            <input id="sp-new" className="input" value={name} autoComplete="off" placeholder="Rohan" enterKeyHint="done"
              aria-invalid={!!nameErr} aria-describedby={nameErr ? 'sp-new-err' : undefined}
              onChange={e => { setName(e.target.value); setNameErr(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void add(); } }} />
            {nameErr && <span className="err" id="sp-new-err" role="alert">{nameErr}</span>}
          </div>
          <div className="money-sp-add-btns">
            <button type="button" className="btn" onClick={() => { setAdding(false); setName(''); setNameErr(''); }}>Cancel</button>
            <button type="button" className="btn primary" onClick={() => void add()}><Plus size={16} aria-hidden="true" /> Add</button>
          </div>
        </div>
      )}

      {draft.people.length > 0 && (
        <>
          <div className="money-sp-shares" role="group" aria-label="Shares">
            <div className="money-sp-share">
              <span className="money-sp-who">Me</span>
              <span className="num money-sp-mine" aria-live="polite">{inr(mine)}</span>
            </div>
            {draft.people.map(n => {
              const id = `sp-share-${n.replace(/\W+/g, '-')}`;
              return (
                <div key={n} className="money-sp-share">
                  <label className="money-sp-who" htmlFor={id}>{n}<span className="sr-only">'s share in rupees</span></label>
                  <div className="money-rupee-input money-sp-input">
                    <span aria-hidden="true">₹</span>
                    <input id={id} className="input num" inputMode="decimal" autoComplete="off"
                      value={texts[n] ?? fmtPlain(shareOf(n))} onChange={e => setShare(n, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') e.stopPropagation(); }} />
                  </div>
                </div>
              );
            })}
            <p className="money-sp-hint">
              {draft.custom ? 'Custom shares. Your share is what is left.' : 'Split equally. Type a share to change it.'}
              {draft.custom && <button type="button" className="btn ghost" onClick={resetEqual}><RotateCcw size={16} aria-hidden="true" /> Equal</button>}
            </p>
          </div>

          <span className="money-qe-label" id="sp-paid">Who paid</span>
          <div className="chips money-sp-chips" role="group" aria-labelledby="sp-paid">
            <button type="button" className="chip" aria-pressed={draft.paidBy === ME} onClick={() => onChange({ ...draft, paidBy: ME })}>I paid</button>
            {draft.people.map(n => (
              <button key={n} type="button" className="chip" aria-pressed={sameName(draft.paidBy, n)} onClick={() => onChange({ ...draft, paidBy: n })}>{n} paid</button>
            ))}
          </div>
        </>
      )}
      {error && <span className="money-qe-err" role="alert">{error}</span>}
    </div>
  );
}
