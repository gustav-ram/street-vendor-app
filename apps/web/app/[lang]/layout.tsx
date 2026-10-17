import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UI_LOCALES } from "@streeteats/shared";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Providers } from "@/components/Providers";
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
        <Providers lang={lang}>
          <header className="flex h-(--header-h) shrink-0 items-center justify-between gap-4 border-b-2 border-sand px-4 sm:px-6">
            <a href={`/${lang}`} className="text-2xl font-black tracking-tight text-chile">
              {t("appName")}
            </a>
            <LanguageSwitcher lang={lang} />
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}
