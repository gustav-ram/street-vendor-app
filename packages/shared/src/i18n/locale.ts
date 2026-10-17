import type { UiLocale } from '../constants';

// Kept free of the translation files so lightweight code (e.g. the web
// proxy) can detect the locale without bundling every string.

export const FALLBACK_LOCALE: UiLocale = 'en';

/**
 * Picks the UI locale from preferred language tags, most preferred first
 * (navigator.languages, Accept-Language, or the device locales).
 */
export function pickLocale(preferred: readonly string[]): UiLocale {
  for (const tag of preferred) {
    const lang = tag.trim().toLowerCase().split(/[-_;]/)[0];
    if (lang === 'es' || lang === 'en') return lang;
  }
  return FALLBACK_LOCALE;
}

/** Parses an Accept-Language header into tags ordered by q-value. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { tag, q: q ? Number(q.slice(2)) || 0 : 1, index };
    })
    .filter((x) => x.tag && x.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((x) => x.tag);
}
