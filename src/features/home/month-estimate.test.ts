import { describe, expect, it } from 'vitest';
import { monthEstimate } from './month-estimate';

describe('month-end estimate', () => {
  it('projects the daily average over the whole month', () => {
    expect(monthEstimate(9942, new Date(2026, 10, 27))).toEqual({ total: 11047, daysAfterToday: 3 });
  });
  it('equals what was spent on the last day', () => {
    expect(monthEstimate(9000, new Date(2026, 10, 30))).toEqual({ total: 9000, daysAfterToday: 0 });
  });
  it('waits for enough days and some spending', () => {
    expect(monthEstimate(500, new Date(2026, 11, 4))).toBeNull();
    expect(monthEstimate(0, new Date(2026, 11, 20))).toBeNull();
  });
});
