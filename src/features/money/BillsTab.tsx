import { ChevronLeft, ChevronRight, IndianRupee, Landmark, Receipt, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDaysISO, addMonths, daysLeft, fmtDate, fmtMonth, fromISO, inr, inrShort, toISO, today, todayISO } from '../../lib/format';
import { salarySplit } from '../../lib/logic';
import type { Card, Settings } from '../../lib/types';
import { isActive } from '../../lib/types';
import { bucketByDay, dueItemsInRange, monthGrid, salaryDate, type DueItem, type DueKind } from './cashflow';
import { monthKey, monthStart, openBills, REPEAT_LABEL, sum, YEAR_MULT } from './money-util';
import { BillRow, MiniRow } from './parts';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const KIND_WORD: Record<DueKind, [string, string]> = { bill: ['bill', 'bills'], sip: ['instalment', 'instalments'], maturity: ['maturity', 'maturities'] };

function describe(items: DueItem[]): string {
  const parts: string[] = [];
  for (const k of ['bill', 'sip', 'maturity'] as DueKind[]) {
    const n = items.filter(i => i.kind === k).length;
    if (n) parts.push(`${n} ${KIND_WORD[k][n === 1 ? 0 : 1]}`);
  }
  return parts.join(', ');
}

function DayItem({ it, salaryDay }: { it: DueItem; salaryDay: number }) {
  const c = it.card;
  if (it.kind === 'bill' && !it.projected) return <BillRow c={c} salaryDay={salaryDay} />;
  if (it.kind === 'bill') {
    return <MiniRow c={c} icon={Receipt} right={inr(it.amount)}
      sub={`${REPEAT_LABEL[c.repeat ?? 'none']} repeat · pay the ${fmtDate(c.due!)} bill first`} />;
  }
  if (it.kind === 'sip') {
    return <MiniRow c={c} icon={TrendingUp} right={inr(it.amount)} sub={`${c.invest?.kind ?? 'SIP'} instalment${it.projected ? ' · expected' : ''}`} />;
  }
  return <MiniRow c={c} icon={Landmark} right={inr(it.amount)} sub={`${c.invest?.kind ?? ''} matures`} />;
}

export default function BillsTab({ cards, settings }: { cards: Card[]; settings: Settings }) {
  const [month, setMonth] = useState<Date>(() => monthStart(today()));
  const [sel, setSel] = useState<string>(todayISO());
  const tISO = todayISO();
  const key = monthKey(month);

  const grid = useMemo(() => monthGrid(month), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const from = grid[0].iso;
  const to = addDaysISO(grid[grid.length - 1].iso, 1);

  const d = useMemo(() => {
    const items = dueItemsInRange(cards, from, to);
    const buckets = bucketByDay(items);
    const sal = new Set([-1, 0, 1].map(k => toISO(salaryDate(month.getFullYear(), month.getMonth() + k, settings.salaryDay))));
    const monthItems = items.filter(i => i.date.startsWith(key));
    const bills = openBills(cards);
    const split = salarySplit(cards, settings.salaryDay, today());
    const afterEnd = toISO(addMonths(fromISO(split.salaryISO), 1));
    const before = bills.filter(b => b.due! < split.salaryISO);
    const after = bills.filter(b => b.due! >= split.salaryISO && b.due! < afterEnd);
    const subs = cards.filter(c => c.type === 'bill' && c.autorenew && isActive(c))
      .sort((a, b) => ((a.due ?? '9999') < (b.due ?? '9999') ? -1 : 1));
    const subsYear = sum(subs.map(s => (s.amount ?? 0) * YEAR_MULT[s.repeat ?? 'none']));
    return { buckets, sal, monthItems, split, before, after, subs, subsYear };
  }, [cards, from, to, key, settings.salaryDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (m: Date) => {
    setMonth(m);
    setSel(monthKey(m) === monthKey(today()) ? tISO : toISO(m));
  };
  const selItems = d.buckets.get(sel) ?? [];
  const monthTotal = sum(d.monthItems.filter(i => i.kind !== 'maturity').map(i => i.amount));

  return (
    <>
      <div className="money-month" role="group" aria-label="Calendar month">
        <button type="button" className="icon-btn" aria-label={`Previous month, ${fmtMonth(addMonths(month, -1))}`} onClick={() => go(addMonths(month, -1))}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span className="money-month-name" aria-live="polite">{fmtMonth(month)}</span>
        <button type="button" className="icon-btn" aria-label={`Next month, ${fmtMonth(addMonths(month, 1))}`} onClick={() => go(addMonths(month, 1))}>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
        {key !== monthKey(today()) && <button type="button" className="btn ghost money-this" onClick={() => go(monthStart(today()))}>Today</button>}
      </div>

      <div className="money-layout">
        <section className="money-card money-wide" aria-labelledby="b-cal">
          <div className="money-h-row">
            <h2 id="b-cal" className="money-h">Due in {fmtMonth(month)}</h2>
            <span className="num money-total">{inr(monthTotal)} · {d.monthItems.length} {d.monthItems.length === 1 ? 'item' : 'items'}</span>
          </div>
          <div className="money-cal" role="group" aria-label={`${fmtMonth(month)} calendar`}>
            {WEEK.map(w => <span key={w} className="money-cal-wd" aria-hidden="true">{w}</span>)}
            {grid.map(cell => {
              const items = d.buckets.get(cell.iso) ?? [];
              const total = sum(items.filter(i => i.kind !== 'maturity').map(i => i.amount));
              const isToday = cell.iso === tISO;
              const isSal = d.sal.has(cell.iso);
              const label = [
                fmtDate(cell.iso),
                isToday ? 'today' : '',
                isSal ? 'salary day' : '',
                items.length ? `${describe(items)}${total ? `, ${inr(total)}` : ''}` : 'nothing due',
              ].filter(Boolean).join(', ');
              return (
                <button key={cell.iso} type="button" aria-label={label} aria-pressed={sel === cell.iso} aria-current={isToday ? 'date' : undefined}
                  className={`money-cal-day ${cell.inMonth ? '' : 'out'} ${isToday ? 'today' : ''} ${isSal ? 'sal' : ''} ${items.length ? 'has' : ''}`}
                  onClick={() => setSel(cell.iso)}>
                  <span className="money-cal-n num">{cell.day}{isSal && <IndianRupee size={11} strokeWidth={2.6} aria-hidden="true" />}</span>
                  {items.length > 0 && (
                    <span className="money-cal-dots" aria-hidden="true">
                      {items.slice(0, 3).map((i, n) => <i key={n} className={`k-${i.kind}`} />)}
                      <b className="num">{items.length}</b>
                    </span>
                  )}
                  {total > 0 && <span className="money-cal-amt num" aria-hidden="true">{inrShort(total)}</span>}
                </button>
              );
            })}
          </div>
          <ul className="money-legend" aria-label="Legend">
            <li><i className="k-bill" aria-hidden="true" /> Bill</li>
            <li><i className="k-sip" aria-hidden="true" /> SIP / RD instalment</li>
            <li><i className="k-maturity" aria-hidden="true" /> Maturity</li>
            <li><IndianRupee size={12} aria-hidden="true" /> Salary day</li>
          </ul>

          <div className="money-dayp" aria-live="polite">
            <h3 className="money-day-h">
              <span className="num">{sel === tISO ? `Today · ${fmtDate(sel)}` : fmtDate(sel)}</span>
              {selItems.length > 0 && <span className="num">{inr(sum(selItems.filter(i => i.kind !== 'maturity').map(i => i.amount)))}</span>}
            </h3>
            {d.sal.has(sel) && (
              <p className="money-sal-note"><IndianRupee size={14} aria-hidden="true" /> Salary day{settings.salaryAmount ? <> · <span className="num">{inr(settings.salaryAmount)}</span> expected</> : ''}</p>
            )}
            {selItems.length
              ? <ul className="money-list">{selItems.map((it, n) => <DayItem key={`${it.card.id}-${it.kind}-${n}`} it={it} salaryDay={settings.salaryDay} />)}</ul>
              : <p className="money-muted">Nothing due on this day.</p>}
          </div>
        </section>

        <section className="money-card money-wide" aria-labelledby="b-split">
          <h2 id="b-split" className="money-h">Bills around salary</h2>
          <div className="money-split-cols">
            <div>
              <span className="money-k">Due before salary ({fmtDate(d.split.salaryISO)})</span>
              <span className="money-mid num">{inr(d.split.before)}</span>
              {d.before.length ? (
                <ul className="money-list">{d.before.map(b => <BillRow key={b.id} c={b} salaryDay={settings.salaryDay} showSide={false} />)}</ul>
              ) : <p className="money-muted">Nothing due before salary.</p>}
            </div>
            <div>
              <span className="money-k">Due after salary</span>
              <span className="money-mid num">{inr(d.split.after)}</span>
              {d.after.length ? (
                <ul className="money-list">{d.after.map(b => <BillRow key={b.id} c={b} salaryDay={settings.salaryDay} showSide={false} />)}</ul>
              ) : <p className="money-muted">Nothing due in the month after salary.</p>}
            </div>
          </div>
        </section>

        <section className="money-card money-wide" aria-labelledby="b-sub">
          <div className="money-h-row">
            <h2 id="b-sub" className="money-h">Subscriptions</h2>
            {!!d.subs.length && <span className="num money-total">{inr(d.subsYear)} a year</span>}
          </div>
          {d.subs.length ? (
            <ul className="money-list">
              {d.subs.map(s => {
                const r = s.repeat ?? 'none';
                return <MiniRow key={s.id} c={s} right={`${inr((s.amount ?? 0) * YEAR_MULT[r])}/yr`}
                  sub={`${inr(s.amount)} ${REPEAT_LABEL[r].toLowerCase()}${s.due ? ` · renews ${fmtDate(s.due)}${daysLeft(s.due) < 0 ? ' (overdue)' : ''}` : ''}`} />;
              })}
            </ul>
          ) : <p className="money-muted">No auto-renewing bills. Turn on "Auto-renews" in a bill to track it here.</p>}
        </section>
      </div>
    </>
  );
}
