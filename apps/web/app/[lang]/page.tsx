import { notFound } from "next/navigation";
import { ServerStatus } from "@/components/ServerStatus";
import { isLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getT(lang);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-8">
      <h1 className="text-4xl font-black leading-tight sm:text-5xl">{t("tagline")}</h1>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-3xl border-2 border-ink bg-white p-6">
          <h2 className="text-2xl font-extrabold">{t("home.customerTitle")}</h2>
          <p className="mt-2 text-lg text-ink-soft">{t("home.customerBody")}</p>
          <p className="mt-4 inline-block rounded-full bg-sand px-3 py-1 text-sm font-bold">{t("home.comingSoon")}</p>
        </article>
        <article className="rounded-3xl bg-chile p-6 text-white">
          <h2 className="text-2xl font-extrabold">{t("home.vendorTitle")}</h2>
          <p className="mt-2 text-lg">{t("home.vendorBody")}</p>
          <p className="mt-4 inline-block rounded-full bg-white/20 px-3 py-1 text-sm font-bold">{t("home.comingSoon")}</p>
        </article>
      </section>

      <ServerStatus />
    </main>
  );
}
