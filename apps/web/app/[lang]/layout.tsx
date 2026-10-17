import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UI_LOCALES } from "@streeteats/shared";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { I18nProvider } from "@/lib/i18n/client";
import { isLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";
import "../globals.css";

export function generateStaticParams() {
  return UI_LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getT(lang);
  return { title: t("appName"), description: t("tagline") };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getT(lang);

  return (
    <html lang={lang} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <I18nProvider lang={lang}>
          <header className="flex items-center justify-between gap-4 border-b-2 border-sand px-4 py-3 sm:px-8">
            <a href={`/${lang}`} className="text-2xl font-black tracking-tight text-chile">
              {t("appName")}
            </a>
            <LanguageSwitcher lang={lang} />
          </header>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
