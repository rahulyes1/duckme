/** One line → task: "Submit tax proof tomorrow 6pm !!!". Pure, so it is unit tested. */
import type { Card, Level } from '../../lib/types';
import { addDays, toISO } from '../../lib/format';
import { cleanTitle, detect } from '../plan/smart';

/** ! important, !! very, !!! very very. They must stand alone, so "Call mom!" stays plain text. */
const MARK = /(^|\s)(!{1,3})(?=\s|$)/;

export interface QuickTask { title: string; day?: string; time?: string; level?: Level }

export function parseTask(text: string, ref: Date, ignore: { day?: boolean; time?: boolean } = {}): QuickTask {
  const mark = text.match(MARK);
  const plain = mark ? text.replace(MARK, ' ').replace(/\s{2,}/g, ' ').trim() : text.trim();
  const found = detect(plain, ref).filter(d => !(d.kind === 'time' ? ignore.time : ignore.day));
  let day = (found.find(d => d.kind === 'due') ?? found.find(d => d.kind === 'day'))?.value;
  const time = found.find(d => d.kind === 'time')?.value;
  // A time on its own means today, or tomorrow once that time has gone.
  if (time && !day) {
    const now = `${String(ref.getHours()).padStart(2, '0')}:${String(ref.getMinutes()).padStart(2, '0')}`;
    day = toISO(time > now ? ref : addDays(ref, 1));
  }
  return { title: cleanTitle(plain, found), day, time, level: mark ? (mark[2].length as Level) : undefined };
}

export const taskFields = (t: QuickTask): Partial<Card> & { type: 'task' } => ({
  type: 'task', color: 'sand', title: t.title,
  ...(t.day ? { due: t.day } : {}),
  ...(t.time && t.day ? { reminder: `${t.day}T${t.time}` } : {}),
  ...(t.level ? { level: t.level } : {}),
});
