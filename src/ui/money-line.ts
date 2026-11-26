/**
 * The background "money line": how your money moved through this salary cycle, day by day.
 * With a salary set it is the balance (salary − spends so far); without one it is spending so far
 * drawn going down. Pure function — no DB, no React.
 */
import type { Card } from '../lib/types';
import { addDays, daysBetween, fromISO, toISO } from '../lib/format';

export interface MoneyLine {
  /** One value per day from cycle start up to today (inclusive). */
  values: number[];
  /** Days in the whole cycle (start → day before next salary). */
  totalDays: number;
  /** True when built from real expenses; false = a neutral placeholder line. */
  real: boolean;
}

function lastSalaryDate(salaryDay: number, ref: Date): Date {
  const mk = (y: number, m: number) => new Date(y, m, Math.min(salaryDay, new Date(y, m + 1, 0).getDate()));
  const thisMonth = mk(ref.getFullYear(), ref.getMonth());
  return thisMonth <= ref ? thisMonth : mk(ref.getFullYear(), ref.getMonth() - 1);
}

export function moneyLine(cards: Card[], salary: number | undefined, salaryDay: number, ref: Date): MoneyLine {
  const start = lastSalaryDate(salaryDay, ref);
  const nextStart = lastSalaryDate(salaryDay, addDays(new Date(start.getFullYear(), start.getMonth() + 1, 1), 27));
  const next = nextStart > start ? nextStart : new Date(start.getFullYear(), start.getMonth() + 1, start.getDate());
  const totalDays = Math.max(2, daysBetween(start, next));
  const upto = Math.min(totalDays - 1, Math.max(0, daysBetween(start, ref)));

  const perDay = new Array(upto + 1).fill(0);
  let any = false;
  const startISO = toISO(start), refISO = toISO(ref);
  for (const c of cards) {
    if (c.type !== 'expense' || !c.date || c.status === 'trashed' || c.status === 'killed') continue;
    if (c.date < startISO || c.date > refISO) continue;
    const i = daysBetween(start, fromISO(c.date));
    if (i < 0 || i > upto) continue;
    perDay[i] += c.amount ?? 0;
    any = true;
  }
  if (!any) {
    // Neutral line: a calm, gently easing slope so the page still has its ink line.
    const values = Array.from({ length: upto + 1 }, (_, i) => 100 - 30 * Math.sin((i / Math.max(1, totalDays - 1)) * Math.PI / 2));
    return { values, totalDays, real: false };
  }
  let run = 0;
  const base = salary && salary > 0 ? salary : 0;
  const values = perDay.map(v => { run += v; return base - run; });
  return { values, totalDays, real: true };
}

/** SVG path (viewBox 1000×300) for the line; y is inverted and padded so it never touches the edges. */
export function linePath(line: MoneyLine, w = 1000, h = 300, pad = 30): { d: string; lastX: number; lastY: number } {
  const v = line.values;
  const max = Math.max(...v), min = Math.min(...v);
  const span = max - min || 1;
  const x = (i: number) => (i / Math.max(1, line.totalDays - 1)) * w;
  const y = (val: number) => pad + (1 - (val - min) / span) * (h - pad * 2);
  if (v.length === 1) {
    const yy = h / 2;
    return { d: `M0 ${yy} L${x(0) + 1} ${yy}`, lastX: x(0), lastY: yy };
  }
  // Smooth curve through the points (Catmull-Rom → cubic Bézier).
  const pts = v.map((val, i) => [x(i), y(val)] as const);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return { d, lastX: last[0], lastY: last[1] };
}
