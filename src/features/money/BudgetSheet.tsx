import { useEffect, useState } from 'react';
import { saveSettings } from '../../lib/db';
import { inr } from '../../lib/format';
import type { Settings } from '../../lib/types';
import { allCategories } from '../../lib/income';
import { Sheet } from '../../ui/Sheet';
import { budgetStatus } from './cashflow';
import { parseAmount } from './money-util';
import { catIcon } from './parts';

/** Per-category monthly budgets. Empty box = no budget. */
export default function BudgetSheet({ open, onClose, settings, spent, monthName }: {
  open: boolean; onClose: () => void; settings: Settings; spent: Record<string, number>; monthName: string;
}) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [weekly, setWeekly] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const v: Record<string, string> = {};
    for (const c of allCategories(settings.customCategories)) v[c] = settings.budgets[c] ? settings.budgets[c].toLocaleString('en-IN') : '';
    setVals(v); setErr({});
    setWeekly(settings.weeklyAllowance ? settings.weeklyAllowance.toLocaleString('en-IN') : '');
  }, [open, settings.budgets, settings.weeklyAllowance]);

  const save = async () => {
    const budgets: Record<string, number> = {};
    const errs: Record<string, string> = {};
    for (const c of allCategories(settings.customCategories)) {
      const raw = vals[c] ?? '';
      if (!raw.trim()) continue;
      const n = parseAmount(raw);
      if (n === null || n < 0) errs[c] = 'Enter an amount in rupees, like 5,000';
      else if (n > 0) budgets[c] = Math.round(n);
    }
    setErr(errs);
    if (Object.keys(errs).length) return;
    const w = weekly.trim() ? parseAmount(weekly) : 0;
    if (w === null || w < 0) { setErr({ ...errs, __weekly: 'Enter a weekly amount, like 3,500, or leave it empty' }); return; }
    await saveSettings({ budgets, weeklyAllowance: w ? Math.round(w) : undefined });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Monthly budgets">
      <div className="field money-weekly">
        <label htmlFor="budget-weekly">Weekly allowance (Mon–Sun)</label>
        <div className="money-rupee-input">
          <span aria-hidden="true">₹</span>
          <input id="budget-weekly" className="input num" inputMode="decimal" autoComplete="off" value={weekly} placeholder="Not set"
            aria-invalid={!!err.__weekly} onChange={e => setWeekly(e.target.value)}
            onBlur={e => { const n = parseAmount(e.target.value); if (n !== null) setWeekly(n.toLocaleString('en-IN')); }} />
        </div>
        {err.__weekly ? <span className="err" role="alert">{err.__weekly}</span>
          : <span className="help">Everyday spending only (bills and rent don't count). Money shows what's left this week and per day.</span>}
      </div>
      <p className="money-muted">Category budgets: leave a box empty for no budget. Bars turn amber at 80% and red when you go over.</p>
      <div className="money-budget-grid">
        {allCategories(settings.customCategories).map(c => {
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
