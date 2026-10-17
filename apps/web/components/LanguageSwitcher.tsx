"use client";

import { useTranslation } from "react-i18next";
import { UI_LOCALES, type UiLocale } from "@streeteats/shared";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";

const swapLocale = (path: string, target: UiLocale) => path.replace(/^\/(en|es)(?=\/|$)/, `/${target}`);

/**
 * Big two-button EN / ES toggle. Keeps the current page and query string.
 * Reads the path at click time (not via usePathname) so pages stay prerenderable.
 */
export function LanguageSwitcher({ lang }: { lang: UiLocale }) {
  const { t } = useTranslation();

  return (
    <div role="group" aria-label={t("language.label")} className="flex rounded-full border-2 border-ink p-1">
      {UI_LOCALES.map((l) => (
        <a
          key={l}
          href={`/${l}`}
          lang={l}
          aria-current={l === lang ? "true" : undefined}
          onClick={(e) => {
            e.preventDefault();
            document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
            const { pathname, search, hash } = window.location;
            window.location.assign(swapLocale(pathname, l) + search + hash);
          }}
          className={`min-h-11 rounded-full px-4 py-2 text-base font-bold ${
            l === lang ? "bg-ink text-white" : "text-ink hover:bg-sand"
          }`}
        >
          {t(`language.${l}`)}
        </a>
      ))}
    </div>
  );
}
