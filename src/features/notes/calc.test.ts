import { describe, expect, it } from 'vitest';
import { calcByLine, calcLines, evalExpr, fmtCalc, tokenize } from './calc';

const v = (src: string, vars: Record<string, number> = {}) => evalExpr(src, new Map(Object.entries(vars)));

describe('evalExpr', () => {
  it('does + - * / with precedence', () => {
    expect(v('2 + 3 * 4')).toBe(14);
    expect(v('(2 + 3) * 4')).toBe(20);
    expect(v('100 / 4 - 5')).toBe(20);
  });
  it('handles unary minus and nested brackets', () => {
    expect(v('-5 + 10')).toBe(5);
    expect(v('-(2 + 3) * -2')).toBe(10);
  });
  it('reads Indian commas', () => {
    expect(v('1,20,000 + 5,000')).toBe(125000);
    expect(v('₹18,000')).toBe(18000);
  });
  it('reads k / L / lakh / cr suffixes', () => {
    expect(v('5k')).toBe(5000);
    expect(v('1.2L')).toBe(120000);
    expect(v('1.5 lakh')).toBe(150000);
    expect(v('2cr')).toBe(20000000);
    expect(v('2.5 crore')).toBe(25000000);
  });
  it('reads ₹ / rs / Rs. prefixes and the /- suffix', () => {
    expect(v('rs 500 + Rs.250 + ₹ 250')).toBe(1000);
    expect(v('₹500/- * 2')).toBe(1000);
  });
  it('accepts × ÷ and the unicode minus', () => {
    expect(v('3 × 4 ÷ 2 − 1')).toBe(5);
  });
  it('uses variables case-insensitively', () => {
    expect(v('Salary - RENT', { salary: 100000, rent: 18000 })).toBe(82000);
  });
  it('supports percent: x% of y, y + x%, y - x%', () => {
    expect(v('18% of 1L')).toBeCloseTo(18000);
    expect(v('1000 + 10%')).toBeCloseTo(1100);
    expect(v('salary - 10%', { salary: 50000 })).toBeCloseTo(45000);
    expect(v('salary * 12%', { salary: 50000 })).toBeCloseTo(6000);
  });
  it('returns null for errors instead of throwing', () => {
    expect(v('')).toBeNull();
    expect(v('2 +')).toBeNull();
    expect(v('(2 + 3')).toBeNull();
    expect(v('10 / 0')).toBeNull();
    expect(v('unknown + 1')).toBeNull();
    expect(v('2 $ 3')).toBeNull();
    expect(v('5kg')).toBeNull();
  });
  it('never uses eval: code-looking input is just an error', () => {
    expect(v('alert(1)')).toBeNull();
    expect(v('constructor.constructor("x")()')).toBeNull();
  });
  it('tokenizer keeps "rs" words that are not money as identifiers', () => {
    expect(tokenize('rsvp')).toEqual([{ t: 'id', v: 'rsvp' }]);
  });
});

describe('calcLines', () => {
  const note = [
    'Budget',
    'rent = 18000',
    'sip = 5k',
    'salary = 1.2L',
    'left = salary - rent - sip =',
    'groceries 2400 + 1800 + 650 =',
  ].join('\n');

  it('defines variables on earlier lines and shows "=" results', () => {
    const r = calcByLine(note);
    expect(r.get(0)).toBeUndefined();
    expect(r.get(1)).toMatchObject({ kind: 'var', name: 'rent', value: 18000, literal: true });
    expect(r.get(2)).toMatchObject({ kind: 'var', name: 'sip', value: 5000, literal: false });
    expect(r.get(3)).toMatchObject({ kind: 'var', value: 120000 });
    expect(r.get(4)).toMatchObject({ kind: 'result', name: 'left', value: 97000 });
    expect(r.get(5)).toMatchObject({ kind: 'result', value: 4850, label: 'groceries 2400 + 1800 + 650' });
  });
  it('variables only see lines ABOVE them', () => {
    const r = calcLines('a = b + 1\nb = 5\nc = b * 2 =');
    expect(r.map(x => x.name)).toEqual(['b', 'c']);
    expect(r[1].value).toBe(10);
  });
  it('later definitions override earlier ones', () => {
    const r = calcByLine('x = 10\nx = 20\nx * 2 =');
    expect(r.get(2)?.value).toBe(40);
  });
  it('ignores list / checkbox markers and bold', () => {
    const r = calcByLine('- rent = 18,000\n[ ] **maid** = 4k\n[x] rent + maid =');
    expect(r.get(2)?.value).toBe(22000);
  });
  it('skips broken lines silently and keeps going', () => {
    const r = calcLines('note = buy milk\nrent = 18000 (due 5th)\n2 + =\nfee = 500\nfee * 2 =');
    expect(r.map(x => x.value)).toEqual([500, 1000]);
  });
  it('ignores ordinary text without "="', () => {
    expect(calcLines('Pay rent 18000 by 5th\nmilk 60')).toEqual([]);
  });
  it('does not crash on huge or weird input', () => {
    expect(() => calcLines('='.repeat(5000))).not.toThrow();
    expect(calcLines('9'.repeat(400) + ' =')).toEqual([]);
  });
});

describe('fmtCalc', () => {
  it('formats with Indian grouping, decimals and sign', () => {
    expect(fmtCalc(120000)).toBe('₹1,20,000');
    expect(fmtCalc(82.5)).toBe('₹82.5');
    expect(fmtCalc(-400)).toBe('−₹400');
    expect(fmtCalc(1 / 3)).toBe('₹0.33');
  });
});
