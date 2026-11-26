import { describe, expect, it } from 'vitest';
import type { StaffInfo } from '../../lib/types';
import {
  addAdvance, addStaffDays, daysInMonth, daysSinceLastPaid, defaultRecovery, isFestivalSeason, leaveDeduction, netPay, perDayRate,
  recentLog, recordPayment,
} from './staff';

describe('day rate and leave', () => {
  it('uses pay ÷ 30 per day', () => {
    expect(perDayRate(6000)).toBe(200);
    expect(leaveDeduction(6000, 2)).toBe(400);
  });
  it('allows a custom rate and never cuts more than the pay', () => {
    expect(leaveDeduction(6000, 2, 250)).toBe(500);
    expect(leaveDeduction(6000, 40)).toBe(6000);
    expect(leaveDeduction(6000, -3)).toBe(0);
  });
});

describe('advance recovery', () => {
  it('defaults to the smaller of advance and pay', () => {
    expect(defaultRecovery(2000, 6000)).toBe(2000);
    expect(defaultRecovery(9000, 6000)).toBe(6000);
    expect(defaultRecovery(0, 6000)).toBe(0);
  });
});

describe('netPay', () => {
  it('adds and subtracts every part', () => {
    const p = netPay({ base: 6000, leaveDays: 2, extraDays: 1, recovery: 1000, advance: 3000, bonus: 500 });
    expect(p).toEqual({ base: 6000, leaveCut: 400, extraPay: 200, recovery: 1000, bonus: 500, net: 5300 });
  });
  it('never recovers more than the advance', () => {
    expect(netPay({ base: 6000, recovery: 5000, advance: 1500 }).recovery).toBe(1500);
  });
  it('never goes below zero', () => {
    const p = netPay({ base: 6000, leaveDays: 25, recovery: 6000, advance: 6000 });
    expect(p.leaveCut).toBe(5000);
    expect(p.recovery).toBe(1000);
    expect(p.net).toBe(0);
  });
});

describe('log', () => {
  const s0: StaffInfo = { role: 'Maid', advance: 0, log: [] };
  it('advance raises the outstanding amount', () => {
    const s = addAdvance(s0, 1500, '2026-11-05', 'a');
    expect(s.advance).toBe(1500);
    expect(s.log[0]).toMatchObject({ kind: 'advance', amount: 1500 });
    expect(addAdvance(s0, 0, '2026-11-05', 'x')).toBe(s0);
  });
  it('counts leave and extra days by month and since the last payment', () => {
    let s = addStaffDays(s0, 'leave', 1, '2026-10-20', 'l0');
    s = recordPayment(s, netPay({ base: 6000, leaveDays: 1 }), '2026-11-01', ['p', 'b']);
    s = addStaffDays(s, 'leave', 2, '2026-11-10', 'l1');
    s = addStaffDays(s, 'extra', 1, '2026-11-12', 'e1');
    expect(daysInMonth(s.log, 'leave', '2026-11')).toBe(2);
    expect(daysInMonth(s.log, 'leave', '2026-10')).toBe(1);
    expect(daysSinceLastPaid(s.log, 'leave')).toBe(2);
    expect(daysSinceLastPaid(s.log, 'extra')).toBe(1);
    expect(recentLog(s.log, 2).map(e => e.id)).toEqual(['e1', 'l1']);
  });
  it('payment reduces the advance and records the bonus', () => {
    const s = addAdvance(s0, 3000, '2026-11-05', 'a');
    const p = netPay({ base: 6000, recovery: 2000, advance: s.advance, bonus: 1000 });
    const after = recordPayment(s, p, '2026-12-01', ['p', 'b'], 'Cash');
    expect(after.advance).toBe(1000);
    expect(after.log.map(e => e.kind)).toEqual(['advance', 'paid', 'bonus']);
    expect(after.log[1].amount).toBe(5000);
  });
});

describe('festival season', () => {
  it('is October and November', () => {
    expect([8, 9, 10, 11].map(isFestivalSeason)).toEqual([false, true, true, false]);
  });
});
