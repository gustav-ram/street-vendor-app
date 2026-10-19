import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinView } from "@/components/JoinView";
import { isLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/join">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: `${getT(lang)("join.title", { ns: "auth" })} · StreetEats` } : {};
}

export default async function JoinPage({ params }: PageProps<"/[lang]/join">) {
  const { lang } = await params;
  // Reads ?code= from the flyer's QR code, which is request-time data.
  return (
    <Suspense>
      <JoinView lang={lang} />
    </Suspense>
  );
}
