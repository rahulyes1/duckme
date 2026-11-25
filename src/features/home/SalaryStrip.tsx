import { useMemo } from 'react';
import type { Card } from '../../lib/types';
import { fmtDate, fmtDayMonth, inr, today } from '../../lib/format';
import { salarySplit } from '../../lib/logic';
import { useCountUp } from '../../lib/hooks';

export interface SalaryTotals { before: number; after: number; beforeCount: number; afterCount: number; salaryISO: string }

/** Open/delayed bills due before the next salary credit, and within one month after it (logic tested in lib/logic.test.ts). */
export function salaryTotals(cards: Card[], salaryDay: number): SalaryTotals {
  return salarySplit(cards, salaryDay, today());
}

const bills = (n: number) => `${n} bill${n === 1 ? '' : 's'}`;

export function SalaryStrip({ cards, salaryDay }: { cards: Card[]; salaryDay: number }) {
  const t = useMemo(() => salaryTotals(cards, salaryDay), [cards, salaryDay]);
  const b = useCountUp(t.before, 700);
  const a = useCountUp(t.after, 700);
  return (
    <section className="home-strip" aria-label="Bills around your salary">
      <div>
        <small>Before salary · {fmtDayMonth(t.salaryISO)}</small>
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
