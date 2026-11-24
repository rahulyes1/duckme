import { useMemo } from 'react';
import type { Card } from '../../lib/types';
import { addMonths, fmtDate, inr, nextSalary, toISO } from '../../lib/format';
import { useCountUp } from '../../lib/hooks';

export interface SalaryTotals { before: number; after: number; beforeCount: number; afterCount: number; salaryISO: string }

/** Open bills due before the next salary credit, and within one month after it. */
export function salaryTotals(cards: Card[], salaryDay: number): SalaryTotals {
  const sal = nextSalary(salaryDay);
  const salISO = toISO(sal), endISO = toISO(addMonths(sal, 1));
  let before = 0, after = 0, beforeCount = 0, afterCount = 0;
  for (const c of cards) {
    if (c.status !== 'open' || c.type !== 'bill' || !c.due) continue;
    if (c.due < salISO) { before += c.amount ?? 0; beforeCount++; }
    else if (c.due < endISO) { after += c.amount ?? 0; afterCount++; }
  }
  return { before, after, beforeCount, afterCount, salaryISO: salISO };
}

const bills = (n: number) => `${n} bill${n === 1 ? '' : 's'}`;

export function SalaryStrip({ cards, salaryDay }: { cards: Card[]; salaryDay: number }) {
  const t = useMemo(() => salaryTotals(cards, salaryDay), [cards, salaryDay]);
  const b = useCountUp(t.before, 700);
  const a = useCountUp(t.after, 700);
  return (
    <section className="home-strip" aria-label="Bills around your salary">
      <div>
        <small>Before salary · {fmtDate(t.salaryISO)}</small>
        <b aria-hidden="true">{inr(b)}<em>due</em></b>
        <span className="sr-only">{inr(t.before)} due in {bills(t.beforeCount)} before salary on {fmtDate(t.salaryISO)}</span>
      </div>
      <div>
        <small>After salary</small>
        <b aria-hidden="true">{inr(a)}<em>due</em></b>
        <span className="sr-only">{inr(t.after)} due in {bills(t.afterCount)} in the month after salary</span>
      </div>
    </section>
  );
}
