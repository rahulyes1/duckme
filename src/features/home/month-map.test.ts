import { describe, expect, it } from 'vitest';
import { newCard } from '../../lib/actions';
import { monthMap } from './month-map';

const ref = new Date(2026, 10, 27);

describe('month map', () => {
  const cards = [
    newCard({ type: 'expense', title: 'Shopping', amount: 7000, date: '2026-11-27' }),
    newCard({ type: 'expense', title: 'Chai', amount: 40, date: '2026-11-25' }),
    newCard({ type: 'bill', title: 'Rent', amount: 3000, due: '2026-12-05' }),
  ];
  const days = monthMap(cards, { salaryDay: 1, salaryAmount: 50000 }, ref);
  const on = (iso: string) => days.find(d => d.iso === iso)!;

  it('shows three past weeks, this week and next week, starting Monday', () => {
    expect(days).toHaveLength(35);
    expect([days[0].iso, days[34].iso]).toEqual(['2026-11-02', '2026-12-06']);
  });
  it('shades days by spending and keeps small ones visible', () => {
    expect(on('2026-11-27')).toMatchObject({ spent: 7000, heat: 4, today: true });
    expect(on('2026-11-25')).toMatchObject({ spent: 40, heat: 1 });
    expect(on('2026-11-26').heat).toBe(0);
  });
  it('marks the coming bill and salary day', () => {
    expect(on('2026-12-05').bills.map(b => b.title)).toEqual(['Rent']);
    expect(on('2026-12-01').salary).toBe(true);
  });
});
