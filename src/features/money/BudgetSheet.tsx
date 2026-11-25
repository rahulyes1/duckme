import { useEffect, useState } from 'react';
import { saveSettings } from '../../lib/db';
import { inr } from '../../lib/format';
import type { Settings } from '../../lib/types';
import { EXPENSE_CATEGORIES } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { budgetStatus } from './cashflow';
import { parseAmount } from './money-util';
import { catIcon } from './parts';

/** Per-category monthly budgets. Empty box = no budget. */
export default function BudgetSheet({ open, onClose, settings, spent, monthName }: {
  open: boolean; onClose: () => void; settings: Settings; spent: Record<string, number>; monthName: string;
}) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const v: Record<string, string> = {};
    for (const c of EXPENSE_CATEGORIES) v[c] = settings.budgets[c] ? settings.budgets[c].toLocaleString('en-IN') : '';
    setVals(v); setErr({});
  }, [open, settings.budgets]);

  const save = async () => {
    const budgets: Record<string, number> = {};
    const errs: Record<string, string> = {};
    for (const c of EXPENSE_CATEGORIES) {
      const raw = vals[c] ?? '';
      if (!raw.trim()) continue;
      const n = parseAmount(raw);
      if (n === null || n < 0) errs[c] = 'Enter an amount in rupees, like 5,000';
      else if (n > 0) budgets[c] = Math.round(n);
    }
    setErr(errs);
    if (Object.keys(errs).length) return;
    await saveSettings({ budgets });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Monthly budgets">
      <p className="money-muted">Leave a box empty for no budget. Bars turn amber at 80% and red when you go over.</p>
      <div className="money-budget-grid">
        {EXPENSE_CATEGORIES.map(c => {
          const id = `budget-${c.replace(/\s/g, '')}`;
          const Icon = catIcon(c);
          const typed = parseAmount(vals[c] ?? '') ?? 0;
          const st = budgetStatus(spent[c] ?? 0, typed);
          return (
            <div className="field" key={c}>
              <label htmlFor={id} className="money-budget-label"><Icon size={16} aria-hidden="true" /> {c}</label>
              <div className="money-rupee-input">
                <span aria-hidden="true">₹</span>
                <input id={id} className="input num" inputMode="decimal" autoComplete="off" value={vals[c] ?? ''} placeholder="No budget"
                  aria-describedby={`${id}-help${err[c] ? ` ${id}-err` : ''}`} aria-invalid={!!err[c]}
                  onChange={e => setVals(v => ({ ...v, [c]: e.target.value }))}
                  onBlur={e => { const n = parseAmount(e.target.value); if (n !== null) setVals(v => ({ ...v, [c]: n.toLocaleString('en-IN') })); }} />
              </div>
              <span className={`help num money-lvl-text-${st.level}`} id={`${id}-help`}>
                Spent in {monthName}: {inr(spent[c] ?? 0)}{st.level === 'over' ? ` (${inr(st.over)} over)` : st.level === 'warn' ? ` (${st.pct}%)` : ''}
              </span>
              {err[c] && <span className="err" id={`${id}-err`} role="alert">{err[c]}</span>}
            </div>
          );
        })}
      </div>
      <div className="money-sheet-actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={save}>Save budgets</button>
      </div>
    </Sheet>
  );
}
