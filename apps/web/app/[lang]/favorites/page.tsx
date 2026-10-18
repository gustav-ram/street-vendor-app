import type { Metadata } from "next";
import { FavoritesView } from "@/components/community/FavoritesView";
import { isLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/favorites">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: `${getT(lang)("favorites.title", { ns: "community" })} · StreetEats` } : {};
}

export default async function FavoritesPage({ params }: PageProps<"/[lang]/favorites">) {
  const { lang } = await params;
  return <FavoritesView lang={lang} />;
}
