import { describe, expect, it } from 'vitest';
import { newCard } from '../../lib/actions';
import { dueReminders } from '../../lib/reminders';
import { todayPriorities } from '../home/priorities';
import { monthPace, pace } from '../money/pace';
import { laterChoices, laterPatch } from './postpone';
import { parseTask, taskFields } from './quick-task';

const now = new Date(2026, 10, 27, 17, 0);

describe('one-line task', () => {
  it('reads date, time and importance', () => {
    expect(parseTask('submit tax proof tomorrow 6pm !!!', now)).toEqual({ title: 'Submit tax proof', day: '2026-11-28', time: '18:00', level: 3 });
  });
  it('keeps an ordinary exclamation, and rolls a passed time to tomorrow', () => {
    expect(parseTask('Call mom!', now).level).toBeUndefined();
    expect(parseTask('call bank 10am', now).day).toBe('2026-11-28');
    expect(taskFields(parseTask('call bank 6pm !!', now))).toMatchObject({ due: '2026-11-27', reminder: '2026-11-27T18:00', level: 2 });
  });
});

describe('postpone', () => {
  it('offers tonight only before 7 pm', () => {
    expect(laterChoices(now).map(l => l.label)).toEqual(['In 1 hour', 'Tonight', 'Tomorrow', 'Next week']);
    expect(laterChoices(new Date(2026, 10, 27, 21)).map(l => l.label)).not.toContain('Tonight');
  });
  it("moves a task out of today, even an important one, and keeps a later deadline", () => {
    const tomorrow = laterChoices(now).find(l => l.label === 'Tomorrow')!;
    expect(laterPatch({ due: '2026-12-05' }, tomorrow).due).toBeUndefined();
    const c = newCard({ type: 'task', title: 'x', level: 3, due: '2026-11-27' });
    expect(todayPriorities([{ ...c, ...laterPatch(c, tomorrow) }], now).items).toEqual([]);
  });
});

describe('task reminders', () => {
  const c = newCard({ type: 'task', title: 'Call agent', id: 'a', reminder: '2026-11-27T16:30' });
  it('alerts once its time has come, whatever the morning hour setting says', () => {
    expect(dueReminders([c], { salaryDay: 1, reminders: { bills: false, salary: false, hour: 20 } }, now).map(r => r.title)).toEqual(['Call agent']);
    expect(dueReminders([c], { salaryDay: 5 }, new Date(2026, 10, 27, 16, 0))).toEqual([]);
    expect(dueReminders([{ ...c, status: 'done' }], { salaryDay: 5 }, now)).toEqual([]);
  });
});

describe('budget pace', () => {
  it('gives money left per day, counting today', () => {
    expect(pace(18400, 25000, now)).toMatchObject({ daysLeft: 4, perDay: 1650, over: 0, fast: false });
  });
  it('is empty with no budget', () => {
    expect(monthPace([], { budgets: {} }, now)).toBeNull();
  });
});
