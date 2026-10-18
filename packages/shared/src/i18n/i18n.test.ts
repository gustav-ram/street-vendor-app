import { describe, expect, it } from 'vitest';
import { CATEGORIES, LANGUAGES, PAYMENT_METHODS, REPORT_REASONS, REPORT_TARGETS } from '../constants';
import { ERROR_CODES } from '../schemas/errors';
import { parseAcceptLanguage, pickLocale, resources } from './index';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [k2, v2] of flatten(v, key)) out.set(k2, v2);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  const namespaces = Object.keys(resources.en) as (keyof typeof resources.en)[];

  it.each(namespaces)('"%s" has the same keys and placeholders in English and Spanish', (ns) => {
    const en = flatten(resources.en[ns] as Tree);
    const es = flatten(resources.es[ns] as Tree);
    expect([...es.keys()].sort()).toEqual([...en.keys()].sort());
    for (const [key, enText] of en) {
      expect(placeholders(es.get(key)!), `${ns}:${key}`).toEqual(placeholders(enText));
      expect(es.get(key)!.trim(), `${ns}:${key} is empty`).not.toBe('');
    }
  });

  it('has a label for every category, payment method, spoken language, API error code and report reason', () => {
    for (const lng of ['en', 'es'] as const) {
      const c = resources[lng].catalog as Tree;
      for (const k of CATEGORIES) expect((c.categories as Tree)[k], `${lng} category ${k}`).toBeTypeOf('string');
      for (const k of PAYMENT_METHODS) expect((c.payments as Tree)[k], `${lng} payment ${k}`).toBeTypeOf('string');
      for (const k of LANGUAGES) expect((c.languages as Tree)[k], `${lng} language ${k}`).toBeTypeOf('string');
      for (const k of ERROR_CODES) expect((resources[lng].errors as Tree)[k], `${lng} error ${k}`).toBeTypeOf('string');
      const reasons = (resources[lng].community as Tree).report as Tree;
      for (const k of REPORT_REASONS) expect((reasons.reasons as Tree)[k], `${lng} report reason ${k}`).toBeTypeOf('string');
      const targets = (resources[lng].admin as Tree).targets as Tree;
      for (const k of REPORT_TARGETS) expect(targets[k], `${lng} report target ${k}`).toBeTypeOf('string');
    }
  });
});

describe('locale detection', () => {
  it('picks the first supported language', () => {
    expect(pickLocale(['es-MX', 'en-US'])).toBe('es');
    expect(pickLocale(['fr-FR', 'en-GB'])).toBe('en');
    expect(pickLocale(['ko'])).toBe('en');
    expect(pickLocale([])).toBe('en');
  });

  it('orders Accept-Language by quality', () => {
    expect(parseAcceptLanguage('en-US;q=0.5, es-419, fr;q=0.8')).toEqual(['es-419', 'fr', 'en-US']);
    expect(pickLocale(parseAcceptLanguage('fr-CA,es;q=0.9,en;q=0.8'))).toBe('es');
    expect(parseAcceptLanguage(undefined)).toEqual([]);
  });
});
