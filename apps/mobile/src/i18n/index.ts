import { getLocales } from 'expo-localization';
import Storage from 'expo-sqlite/kv-store';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { UiLocale } from '@streeteats/shared';
import { i18nOptions, pickLocale } from '@streeteats/shared/i18n';

const LOCALE_KEY = 'ui.locale';

function savedLocale(): UiLocale | null {
  try {
    const value = Storage.getItemSync(LOCALE_KEY);
    return value === 'en' || value === 'es' ? value : null;
  } catch {
    return null;
  }
}

/** A manual choice wins; otherwise follow the phone's language settings. */
export function initialLocale(): UiLocale {
  return savedLocale() ?? pickLocale(getLocales().map((l) => l.languageTag));
}

void i18next.use(initReactI18next).init({ ...i18nOptions(initialLocale()), initAsync: false });

export async function setLocale(locale: UiLocale) {
  try {
    Storage.setItemSync(LOCALE_KEY, locale);
  } catch {
    // Not remembered this time; the switch still applies for this session.
  }
  await i18next.changeLanguage(locale);
}

export default i18next;
