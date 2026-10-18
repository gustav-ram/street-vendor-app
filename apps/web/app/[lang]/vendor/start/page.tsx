import type { Metadata } from "next";
import { QuickStartForm } from "@/components/dashboard/QuickStartForm";
import { VendorGate } from "@/components/dashboard/VendorGate";
import { isLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/vendor/start">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: `${getT(lang)("quickStart.title", { ns: "dashboard" })} · StreetEats` } : {};
}

export default async function QuickStartPage({ params }: PageProps<"/[lang]/vendor/start">) {
  const { lang } = await params;
  return (
    <VendorGate lang={lang} mode="onboarding">
      <QuickStartForm lang={lang} />
    </VendorGate>
  );
}
