// Kept tiny: proxy.ts imports this, and the proxy bundle should stay small.
export { isUiLocale as isLocale } from "@streeteats/shared/locale";

/** Remembers a manual language choice (read by proxy.ts). */
export const LOCALE_COOKIE = "se_lang";
