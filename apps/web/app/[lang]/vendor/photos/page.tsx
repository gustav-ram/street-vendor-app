import type { Metadata } from "next";
import { PhotosPage } from "@/components/dashboard/Dashboard";
import { isLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/vendor/photos">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: `${getT(lang)("photos.title", { ns: "dashboard" })} · StreetEats` } : {};
}

export default async function VendorPhotosPage({ params }: PageProps<"/[lang]/vendor/photos">) {
  const { lang } = await params;
  return <PhotosPage lang={lang} />;
}
