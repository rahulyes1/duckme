/** Donut maths: each category's arc as a share of the circle, with a gap so rounded ends don't overlap. Pure. */
export function ringArcs(values: number[], circumference: number, gap: number): { length: number; offset: number }[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => ({ length: 0, offset: 0 }));
  let at = 0;
  return values.map(v => {
    const span = (v / total) * circumference;
    const g = values.length > 1 ? gap : 0;
    const arc = { length: Math.max(0.5, span - g), offset: at + Math.min(g, span) / 2 };
    at += span;
    return arc;
  });
}
