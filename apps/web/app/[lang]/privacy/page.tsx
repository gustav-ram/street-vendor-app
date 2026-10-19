import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/privacy">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: `${getT(lang)("title", { ns: "privacy" })} · StreetEats` } : {};
}

const SECTIONS = [
  { key: "customers", icon: "🔎", items: ["location", "stillHere", "reviews", "photos", "tracking"] },
  { key: "vendors", icon: "🛒", items: ["live", "approximate", "upcoming", "phone", "contact", "badge", "stats"] },
  { key: "controls", icon: "🎛️", items: ["offline", "vacation", "export", "delete"] },
] as const;

/** "Your privacy": plain words about what's shared and when. Same content as the iPhone screen. */
export default async function PrivacyPage({ params }: PageProps<"/[lang]/privacy">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getT(lang);
  // Keys are built from SECTIONS below; all of them exist in both languages (checked by the i18n tests).
  const p = (key: string): string => t(key as never, { ns: "privacy" });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-4xl font-black">🔒 {p("title")}</h1>
      <p className="text-xl">{p("intro")}</p>

      <section className="rounded-3xl border-2 border-live bg-live/5 p-5">
        <h2 className="mb-2 text-2xl font-black">{p("never.title")}</h2>
        <p className="text-lg">{p("never.body")}</p>
      </section>

      {SECTIONS.map((s) => (
        <section key={s.key} className="rounded-3xl border-2 border-ink/10 bg-white p-5">
          <h2 className="mb-3 text-2xl font-black">
            {s.icon} {p(`${s.key}.title`)}
          </h2>
          <ul className="flex flex-col gap-3">
            {s.items.map((item) => (
              <li key={item} className="flex gap-3 text-lg">
                <span aria-hidden className="font-black text-live">
                  ✓
                </span>
                <span>{p(`${s.key}.${item}`)}</span>
              </li>
            ))}
          </ul>
          {s.key === "controls" && (
            <Link href={`/${lang}/account`} className="mt-4 inline-flex min-h-12 items-center rounded-full border-2 border-ink px-5 text-lg font-bold hover:bg-sand">
              {p("accountLink")} →
            </Link>
          )}
        </section>
      ))}

      <section className="rounded-3xl bg-sand/60 p-5">
        <h2 className="mb-2 text-2xl font-black">{p("others.title")}</h2>
        <p className="text-lg">{p("others.body")}</p>
      </section>
    </main>
  );
}
