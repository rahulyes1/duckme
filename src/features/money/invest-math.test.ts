import { describe, expect, it } from 'vitest';
import { addMonthsISO, fdValue, goldValue, mfDate, ppfProjection, rankSchemes, rdValue, sipFutureValue, sipNeeded } from './invest-math';

describe('invest maths', () => {
  it('FD: 1 lakh at 7% for 1 year compounds quarterly to ~₹1,07,186', () => {
    expect(fdValue(100000, 7, '2025-11-27', '2026-11-27', '2026-11-27')).toBeGreaterThanOrEqual(107180);
    expect(fdValue(100000, 7, '2025-11-27', '2026-11-27', '2026-11-27')).toBeLessThanOrEqual(107190);
    expect(fdValue(100000, 7, '2025-11-27', '2026-11-27', '2030-01-01')).toBe(fdValue(100000, 7, '2025-11-27', '2026-11-27', '2026-11-27')); // capped
  });
  it('RD: ₹5,000 a month for 12 months at 7%', () => {
    const r = rdValue(5000, 7, '2025-11-27', '2026-11-27', '2026-11-27');
    expect(r.count).toBe(12);
    expect(r.paid).toBe(60000);
    expect(r.value).toBeGreaterThan(62000);
    expect(r.value).toBeLessThan(62600);
  });
  it('SIP future value and SIP needed agree', () => {
    const fv = sipFutureValue(10000, 12, 120);
    expect(fv).toBeGreaterThan(2_300_000);
    expect(fv).toBeLessThan(2_330_000);
    expect(sipNeeded(fv, 12, 120)).toBeGreaterThanOrEqual(10000);
    expect(sipNeeded(fv, 12, 120)).toBeLessThanOrEqual(10001);
    expect(sipFutureValue(10000, 12, 24, 10)).toBeGreaterThan(sipFutureValue(10000, 12, 24));
  });
  it('PPF caps deposits at ₹1.5 lakh a year', () => {
    expect(ppfProjection(0, 200000, 7.1, 1)).toBe(Math.round(150000 * 1.071));
  });
  it('gold by grams and purity', () => {
    expect(goldValue(10, 22, 10000, 0)).toBe(91667);
    expect(goldValue(10, 24, 10000, 8)).toBe(108000);
  });
  it('dates and fund ranking', () => {
    expect(mfDate('25-11-2026')).toBe('2026-11-25');
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
    const r = rankSchemes([{ schemeName: 'X Fund - Regular Plan - Growth' }, { schemeName: 'X Fund - Direct Plan - IDCW' }, { schemeName: 'X Fund - Direct Plan - Growth' }]);
    expect(r[0].schemeName).toBe('X Fund - Direct Plan - Growth');
  });
});
