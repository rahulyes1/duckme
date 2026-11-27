/** One-tap postpone choices. Pure. */
import type { Card } from '../../lib/types';
import { addDays, toISO } from '../../lib/format';

export interface Later { label: string; day: string; time: string }

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function laterChoices(now: Date): Later[] {
  const hour = new Date(now.getTime() + 60 * 60 * 1000);
  return [
    { label: 'In 1 hour', day: toISO(hour), time: hm(hour) },
    ...(now.getHours() < 19 ? [{ label: 'Tonight', day: toISO(now), time: '20:00' }] : []),
    { label: 'Tomorrow', day: toISO(addDays(now, 1)), time: '09:00' },
    { label: 'Next week', day: toISO(addDays(now, 7)), time: '09:00' },
  ];
}

/** Moves the plan and reminder. A deadline moves only if the new day would pass it. */
export function laterPatch(c: Pick<Card, 'due'>, l: Later): Partial<Card> {
  return { reminder: `${l.day}T${l.time}`, when: { unit: 'day', start: l.day }, ...(c.due && c.due < l.day ? { due: l.day } : {}) };
}
