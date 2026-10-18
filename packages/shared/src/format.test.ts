import { describe, expect, it } from 'vitest';
import { centsToInput, parsePriceToCents } from './format';

describe('prices typed by vendors', () => {
  it('accepts the ways people write a price', () => {
    expect(parsePriceToCents('7')).toBe(700);
    expect(parsePriceToCents('7.5')).toBe(750);
    expect(parsePriceToCents('$7.50')).toBe(750);
    expect(parsePriceToCents('7,50')).toBe(750);
    expect(parsePriceToCents(' 12 ')).toBe(1200);
  });

  it('rejects anything that is not a price', () => {
    expect(parsePriceToCents('')).toBeNull();
    expect(parsePriceToCents('abc')).toBeNull();
    expect(parsePriceToCents('7.555')).toBeNull();
    expect(parsePriceToCents('-3')).toBeNull();
    expect(parsePriceToCents('12345')).toBeNull();
  });

  it('round-trips for editing', () => {
    expect(centsToInput(700)).toBe('7');
    expect(centsToInput(750)).toBe('7.50');
    expect(parsePriceToCents(centsToInput(1999))).toBe(1999);
  });
});
