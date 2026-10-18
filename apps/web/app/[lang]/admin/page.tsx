import type { Metadata } from "next";
import { AdminView } from "@/components/admin/AdminView";
import { isLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/admin">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: `${getT(lang)("title", { ns: "admin" })} · StreetEats`, robots: { index: false } } : {};
}

export default async function AdminPage({ params }: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  return <AdminView lang={lang} />;
}
