/** Stats: the category ring for a week, month, year or all time, with the list under it. */
import { useMemo, useState } from 'react';
import { addDays, fmtMonth, inr, toISO, today, todayISO } from '../../lib/format';
import { isSpend } from '../../lib/logic';
import type { Card } from '../../lib/types';
import CategorySheet from './CategorySheet';
import { sum } from './money-util';
import { ringArcs } from './ring';

type Range = '1W' | '1M' | '1Y' | 'All';
const RANGES: Range[] = ['1W', '1M', '1Y', 'All'];
export const RING_COLORS = ['#12996B', '#E0443C', '#7A63E6', '#B4C13A', '#E58A68', '#3D9BD6', '#D3629F', '#8F8F96'];
const R = 90, C = 2 * Math.PI * R;

export default function StatsDonut({ cards }: { cards: Card[] }) {
  const [range, setRange] = useState<Range>('1M');
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const iso = todayISO();
  const period = range === '1W' ? 'Last 7 days' : range === '1M' ? fmtMonth(today()) : range === '1Y' ? iso.slice(0, 4) : 'All time';
  const spends = useMemo(() => {
    const from = range === '1W' ? toISO(addDays(today(), -6)) : range === '1M' ? `${iso.slice(0, 7)}-01` : range === '1Y' ? `${iso.slice(0, 4)}-01-01` : '';
    return cards.filter(c => isSpend(c) && !!c.date && c.date >= from && c.date <= iso);
  }, [cards, range, iso]);
  const rows = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of spends) m.set(c.category || 'Other', (m.get(c.category || 'Other') ?? 0) + (c.amount ?? 0));
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [spends]);
  const total = sum(rows.map(r => r[1]));
  const arcs = ringArcs(rows.map(r => r[1]), C, 20);
  const color = (i: number) => RING_COLORS[Math.min(i, RING_COLORS.length - 1)];

  return (
    <section className="money-wide donut" aria-label="Spending by category">
      <div className="donut-ranges" role="group" aria-label="Period">
        {RANGES.map(r => <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>)}
      </div>
      <div className="donut-ring">
        <svg viewBox="0 0 220 220" aria-hidden="true">
          <circle cx="110" cy="110" r={R} className="donut-base" />
          {total > 0 && rows.map(([name], i) => (
            <circle key={name} cx="110" cy="110" r={R} fill="none" stroke={color(i)} strokeWidth="18" strokeLinecap="round"
              strokeDasharray={`${arcs[i].length} ${C}`} strokeDashoffset={-arcs[i].offset} transform="rotate(-90 110 110)" />
          ))}
        </svg>
        <p><span>{period}</span><b className="num">{inr(total)}</b><span>spent</span></p>
      </div>
      {rows.length ? (
        <ul className="donut-list">
          {(all ? rows : rows.slice(0, 4)).map(([name, v], i) => (
            <li key={name}>
              <button type="button" onClick={() => setOpen(name)}>
                <i className="num" style={{ background: color(i) }}>{((v / total) * 100).toFixed(1)}%</i>
                <span>{name}</span>
                <b className="num">−{inr(v)}</b>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="money-muted">No spends in this period</p>}
      {rows.length > 4 && <button type="button" className="btn ghost" aria-expanded={all} onClick={() => setAll(a => !a)}>{all ? 'Top 4' : `All ${rows.length} categories`}</button>}
      <CategorySheet category={open} spends={spends} period={period} onClose={() => setOpen(null)} />
    </section>
  );
}
