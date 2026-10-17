"use client";

import { createInstance } from "i18next";
import { useState, type ReactNode } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { UiLocale } from "@streeteats/shared";
import { i18nOptions } from "@streeteats/shared/i18n";

/**
 * Translations for Client Components. The language comes from the URL
 * (/en or /es), so switching language is a navigation, not client state.
 */
export function I18nProvider({ lang, children }: { lang: UiLocale; children: ReactNode }) {
  const [i18n] = useState(() => {
    const instance = createInstance();
    void instance.use(initReactI18next).init({ ...i18nOptions(lang), initAsync: false });
    return instance;
  });
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
