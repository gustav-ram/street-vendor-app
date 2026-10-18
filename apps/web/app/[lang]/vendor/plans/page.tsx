import type { Metadata } from "next";
import { PlansPage } from "@/components/dashboard/Dashboard";
import { isLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/vendor/plans">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: `${getT(lang)("upcoming.title", { ns: "dashboard" })} · StreetEats` } : {};
}

export default async function VendorPlansPage({ params }: PageProps<"/[lang]/vendor/plans">) {
  const { lang } = await params;
  return <PlansPage lang={lang} />;
}
