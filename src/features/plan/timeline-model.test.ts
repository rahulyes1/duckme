import { describe, expect, it } from 'vitest';
import type { Card } from '../../lib/types';
import { buildBuckets, buildEvents } from './timeline-model';

const ref = new Date(2026, 10, 27); // Fri 27-11-2026
const card = (p: Partial<Card>): Card => ({
  id: p.id ?? 'x', type: 'task', title: 'T', body: '', color: 'white', labels: [], links: [], pinned: false,
  status: 'open', rank: 0, createdAt: 0, updatedAt: 0, ...p,
} as Card);

describe('buildEvents', () => {
  it('shows a task planned for a day even without a deadline', () => {
    const ev = buildEvents([card({ id: 'a', title: 'Call mummy', when: { unit: 'day', start: '2026-11-28' } })], ref);
    expect(ev.map(e => [e.label, e.date])).toEqual([['Call mummy', '2026-11-28']]);
  });
  it('a deadline wins over the planned day', () => {
    const ev = buildEvents([card({ id: 'b', due: '2026-11-30', when: { unit: 'day', start: '2026-11-28' } })], ref);
    expect(ev.map(e => e.date)).toEqual(['2026-11-30']);
  });
  it('skips past planned days and week/month plans', () => {
    const ev = buildEvents([
      card({ id: 'c', when: { unit: 'day', start: '2026-11-20' } }),
      card({ id: 'd', when: { unit: 'week', start: '2026-11-23' } }),
    ], ref);
    expect(ev).toEqual([]);
  });
});

describe('buildBuckets', () => {
  it('day rows use a short DD-MM date that fits the narrow column', () => {
    const b = buildBuckets(0, 1, ref);
    expect(b[1]).toMatchObject({ label: 'Tmrw', sub: '28 Nov' });
  });
});
