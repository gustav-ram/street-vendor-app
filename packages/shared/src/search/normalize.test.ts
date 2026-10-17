import { describe, expect, it } from 'vitest';
import { normalizeText } from './normalize';

describe('normalizeText', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalizeText('  Élote, ¡ASADO!  ')).toBe('elote asado');
    expect(normalizeText('Tamales Oaxaqueños')).toBe('tamales oaxaquenos');
    expect(normalizeText('L.A.-style hot dog')).toBe('la style hot dog');
    expect(normalizeText("K'iche' & Q’anjob’al")).toBe('kiche qanjobal');
  });

  it('keeps non-Latin scripts', () => {
    expect(normalizeText('호떡 Hotteok')).toBe('호떡 hotteok');
  });
});
