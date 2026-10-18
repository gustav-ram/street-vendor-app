import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { isLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/vendor">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: `${getT(lang)("title", { ns: "dashboard" })} · StreetEats` } : {};
}

export default async function VendorDashboardPage({ params }: PageProps<"/[lang]/vendor">) {
  const { lang } = await params;
  return <Dashboard lang={lang} />;
}
