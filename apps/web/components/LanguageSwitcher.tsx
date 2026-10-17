"use client";

import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { UI_LOCALES, type UiLocale } from "@streeteats/shared";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";

/** Big two-button EN / ES toggle. Keeps the current page and query string. */
export function LanguageSwitcher({ lang }: { lang: UiLocale }) {
  const { t } = useTranslation();
  const pathname = usePathname();

  const hrefFor = (target: UiLocale) => pathname.replace(/^\/(en|es)(?=\/|$)/, `/${target}`);

  return (
    <div role="group" aria-label={t("language.label")} className="flex rounded-full border-2 border-ink p-1">
      {UI_LOCALES.map((l) => (
        <a
          key={l}
          href={hrefFor(l)}
          lang={l}
          aria-current={l === lang ? "true" : undefined}
          onClick={(e) => {
            e.preventDefault();
            document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
            window.location.assign(hrefFor(l) + window.location.search + window.location.hash);
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
