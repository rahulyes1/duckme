import { describe, expect, it } from 'vitest';
import { chipsFor, cleanTitle, detect, reminderFrom, timeLabel, toTime, triggerOf, warningsFor } from './smart';

// Wednesday 25-11-2026; salary on the 1st → next salary Tue 01-12-2026.
const REF = new Date(2026, 10, 25);
const H = { times: {}, dues: {} };
const vals = (text: string) => Object.fromEntries(detect(text, REF).map(d => [d.kind, d.value]));

describe('trigger words', () => {
  it('on / at / by', () => {
    expect(triggerOf('Pay rent on')).toBe('on');
    expect(triggerOf('Call bank at ')).toBe('at');
    expect(triggerOf('File ITR by')).toBe('by');
    expect(triggerOf('Finish report before')).toBe('by');
    expect(triggerOf('Book tickets')).toBeNull();
    expect(triggerOf('Turn on')).toBe('on');
  });
});

describe('words become dates and times', () => {
  it('kal / parso / today', () => {
    expect(vals('call mom kal')).toEqual({ day: '2026-11-26' });
    expect(vals('gym parso')).toEqual({ day: '2026-11-27' });
    expect(vals('pay bill today')).toEqual({ day: '2026-11-25' });
  });
  it('weekday names and next', () => {
    expect(vals('meeting friday')).toEqual({ day: '2026-11-27' });
    expect(vals('meeting on fri')).toEqual({ day: '2026-11-27' });
    expect(vals('review next monday')).toEqual({ day: '2026-11-30' });
    expect(vals('team call wed')).toEqual({ day: '2026-11-25' }); // today is Wednesday
  });
  it('dates', () => {
    expect(vals('rent 5th')).toEqual({ day: '2026-12-05' });
    expect(vals('trip 15 dec')).toEqual({ day: '2026-12-15' });
    expect(vals('trip dec 15')).toEqual({ day: '2026-12-15' });
    expect(vals('renew in 3 days')).toEqual({ day: '2026-11-28' });
    expect(vals('clean flat this weekend')).toEqual({ day: '2026-11-28' });
  });
  it('a date after by/before is a deadline', () => {
    expect(vals('file ITR by 31 dec')).toEqual({ due: '2026-12-31' });
    expect(vals('submit before friday')).toEqual({ due: '2026-11-27' });
    expect(vals('do it friday by month end')).toEqual({ day: '2026-11-27', due: '2026-11-30' });
  });
  it('times', () => {
    expect(vals('call bank at 6pm')).toEqual({ time: '18:00' });
    expect(vals('call bank at 10:30 am')).toEqual({ time: '10:30' });
    expect(vals('call bank at 6')).toEqual({ time: '18:00' });
    expect(vals('call bank at 9')).toEqual({ time: '09:00' });
    expect(vals('gym morning')).toEqual({ time: '09:00' });
    expect(vals('pay rent kal after office')).toEqual({ day: '2026-11-26', time: '19:00' });
  });
  it('does not misread ordinary words', () => {
    expect(vals('wedding gift money')).toEqual({});
    expect(vals('buy fridge')).toEqual({});
    expect(vals('market at 2 days')).toEqual({});
  });
});

describe('cleanTitle', () => {
  it('removes the date words and a dangling trigger', () => {
    const t = 'pay rent on 5th at 6pm';
    expect(cleanTitle(t, detect(t, REF))).toBe('Pay rent');
    expect(cleanTitle('file ITR by', [])).toBe('File ITR');
    expect(cleanTitle('call mom kal', detect('call mom kal', REF))).toBe('Call mom');
  });
});

describe('chips', () => {
  it('on → days ending with Pick a date', () => {
    const c = chipsFor('Pay rent on', REF, 1, H, {});
    expect(c.map(x => x.label)).toEqual(['Today', 'Tomorrow', 'Saturday', 'Monday', 'Salary day', 'Pick a date']);
    expect(c[1].value).toBe('2026-11-26');
  });
  it('at → times, habits first', () => {
    const c = chipsFor('Call at', REF, 1, { times: { '19:00': 3 }, dues: {} }, {});
    expect(c[0]).toMatchObject({ label: '7 pm', sub: 'After office' });
  });
  it('by → deadlines', () => {
    const c = chipsFor('File ITR by', REF, 1, H, {});
    expect(c.map(x => x.label)).toEqual(['This Sunday', 'Month end', 'Before salary', 'Tomorrow', 'In a week', 'Pick a date']);
    expect(c.find(x => x.label === 'Before salary')!.value).toBe('2026-11-30');
  });
  it('bill-like tasks get a nudge; others do not', () => {
    expect(chipsFor('Pay electricity bill', REF, 1, H, {}).map(c => c.label)).toEqual(['Before salary', 'By Sunday']);
    expect(chipsFor('Call grandma', REF, 1, H, {})).toEqual([]);
    expect(chipsFor('Pay bill', REF, 1, H, { due: '2026-11-28' })).toEqual([]);
  });
});

describe('real-life warnings', () => {
  it('Sunday deadline → Saturday fix', () => {
    const w = warningsFor({ due: '2026-11-29' }, REF);
    expect(w[0].id).toBe('due-sun');
    expect(w[0].fix!.patch).toEqual({ due: '2026-11-28' });
  });
  it('bank holiday → day before', () => {
    const w = warningsFor({ due: '2026-12-25' }, REF);
    expect(w[0]).toMatchObject({ id: 'due-hol' });
    expect(w[0].fix!.patch).toEqual({ due: '2026-12-24' });
  });
  it('planned after the deadline', () => {
    const w = warningsFor({ day: '2026-12-02', due: '2026-11-30' }, REF);
    expect(w.map(x => x.id)).toContain('after-due');
  });
  it('past dates', () => {
    expect(warningsFor({ due: '2026-11-20', day: '2026-11-21' }, REF).map(x => x.id)).toEqual(['due-past', 'after-due', 'day-past']);
  });
  it('nothing to warn about', () => {
    expect(warningsFor({ day: '2026-11-27', due: '2026-11-28' }, REF)).toEqual([]);
  });
});

describe('times and reminders', () => {
  it('toTime / timeLabel', () => {
    expect(toTime(6)).toBe('18:00');
    expect(toTime(12)).toBe('12:00');
    expect(toTime(12, 0, 'am')).toBe('00:00');
    expect(timeLabel('18:30')).toBe('6:30 pm');
    expect(timeLabel('09:00')).toBe('9 am');
  });
  it('reminder on the planned day or today', () => {
    expect(reminderFrom({ time: '18:00', day: '2026-11-27' }, REF)).toBe('2026-11-27T18:00');
    expect(reminderFrom({ time: '18:00' }, REF)).toBe('2026-11-25T18:00');
    expect(reminderFrom({}, REF)).toBeUndefined();
  });
});
