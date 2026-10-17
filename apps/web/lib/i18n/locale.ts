import { UI_LOCALES, type UiLocale } from "@streeteats/shared";

/** Remembers a manual language choice (read by proxy.ts). */
export const LOCALE_COOKIE = "se_lang";

export function isLocale(value: string): value is UiLocale {
  return (UI_LOCALES as readonly string[]).includes(value);
}
