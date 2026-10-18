import type { Metadata } from "next";
import { ProfilePage } from "@/components/dashboard/Dashboard";
import { isLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/vendor/profile">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: `${getT(lang)("settings.title", { ns: "dashboard" })} · StreetEats` } : {};
}

export default async function VendorProfilePage({ params }: PageProps<"/[lang]/vendor/profile">) {
  const { lang } = await params;
  return <ProfilePage lang={lang} />;
}
