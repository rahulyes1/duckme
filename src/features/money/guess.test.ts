import { describe, expect, it } from 'vitest';
import { guessCategory } from './money-util';

describe('guessCategory', () => {
  it('guesses from everyday notes', () => {
    expect(guessCategory('chai')).toBe('Food');
    expect(guessCategory('Swiggy')).toBe('Food');
    expect(guessCategory('uber to office')).toBe('Travel');
    expect(guessCategory('petrol')).toBe('Fuel');
  });
  it('falls back to Other', () => {
    expect(guessCategory('')).toBe('Other');
    expect(guessCategory('random thing')).toBe('Other');
  });
});

import { parseAmount } from './money-util';
describe('parseAmount shorthand', () => {
  it('reads k / lakh / cr', () => {
    expect(parseAmount('40k')).toBe(40000);
    expect(parseAmount('1.5 lakh')).toBe(150000);
    expect(parseAmount('₹2L')).toBe(200000);
    expect(parseAmount('Rs 1,250')).toBe(1250);
    expect(parseAmount('1cr')).toBe(1e7);
  });
  it('still rejects junk', () => {
    expect(parseAmount('k')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('12x')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
});
