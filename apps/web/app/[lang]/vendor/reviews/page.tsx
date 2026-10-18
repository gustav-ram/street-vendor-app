import type { Metadata } from "next";
import { ReviewsPage } from "@/components/dashboard/Dashboard";
import { isLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/vendor/reviews">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: `${getT(lang)("reviews.title", { ns: "dashboard" })} · StreetEats` } : {};
}

export default async function VendorReviewsPage({ params }: PageProps<"/[lang]/vendor/reviews">) {
  const { lang } = await params;
  return <ReviewsPage lang={lang} />;
}
