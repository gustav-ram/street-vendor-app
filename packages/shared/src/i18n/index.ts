import type { UiLocale } from '../constants';
import { FALLBACK_LOCALE } from './locale';
import enAuth from './en/auth.json';
import enCatalog from './en/catalog.json';
import enCommon from './en/common.json';
import enErrors from './en/errors.json';
import enSearch from './en/search.json';
import enVendor from './en/vendor.json';
import esAuth from './es/auth.json';
import esCatalog from './es/catalog.json';
import esCommon from './es/common.json';
import esErrors from './es/errors.json';
import esSearch from './es/search.json';
import esVendor from './es/vendor.json';

// Every user-facing string lives in these JSON files (one folder per
// language, one file per namespace). Adding a language means adding a
// folder and listing it here and in UI_LOCALES.

export const resources = {
  en: { common: enCommon, errors: enErrors, catalog: enCatalog, auth: enAuth, search: enSearch, vendor: enVendor },
  es: { common: esCommon, errors: esErrors, catalog: esCatalog, auth: esAuth, search: esSearch, vendor: esVendor },
} as const;

export type Namespace = keyof (typeof resources)['en'];
export const NAMESPACES = Object.keys(resources.en) as Namespace[];
export const DEFAULT_NS: Namespace = 'common';
export { FALLBACK_LOCALE };

/** Base i18next options shared by both apps; each app adds its own detection. */
export function i18nOptions(lng: UiLocale) {
  return {
    resources,
    lng,
    fallbackLng: FALLBACK_LOCALE,
    ns: NAMESPACES,
    defaultNS: DEFAULT_NS,
    // React already escapes output.
    interpolation: { escapeValue: false },
    returnNull: false,
  } as const;
}

export { parseAcceptLanguage, pickLocale } from './locale';
