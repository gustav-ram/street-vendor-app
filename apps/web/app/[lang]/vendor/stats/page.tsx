import type { Metadata } from "next";
import { StatsPage } from "@/components/dashboard/Dashboard";
import { isLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/vendor/stats">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: `${getT(lang)("stats.title", { ns: "dashboard" })} · StreetEats` } : {};
}

export default async function VendorStatsPage({ params }: PageProps<"/[lang]/vendor/stats">) {
  const { lang } = await params;
  return <StatsPage lang={lang} />;
}
