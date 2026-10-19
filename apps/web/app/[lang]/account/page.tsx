import type { Metadata } from "next";
import { AccountView } from "@/components/account/AccountView";
import { isLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/account">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: `${getT(lang)("title", { ns: "account" })} · StreetEats`, robots: { index: false } } : {};
}

export default async function AccountPage({ params }: PageProps<"/[lang]/account">) {
  const { lang } = await params;
  return <AccountView lang={lang} />;
}
