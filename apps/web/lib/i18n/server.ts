import { createInstance, type TFunction } from "i18next";
import type { UiLocale } from "@streeteats/shared";
import { i18nOptions } from "@streeteats/shared/i18n";

// Translations for Server Components. The resources are bundled, so init is
// synchronous and one instance per language is reused.
const cache = new Map<UiLocale, TFunction>();

export function getT(lng: UiLocale): TFunction {
  let t = cache.get(lng);
  if (!t) {
    const instance = createInstance();
    void instance.init({ ...i18nOptions(lng), initAsync: false });
    t = instance.t;
    cache.set(lng, t);
  }
  return t;
}
