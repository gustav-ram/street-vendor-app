"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { GoLivePanel } from "./GoLivePanel";
import { MenuEditor } from "./MenuEditor";
import { ProfileForm } from "./ProfileForm";
import { StatusComposer } from "./StatusComposer";
import { VendorGate } from "./VendorGate";

const linkClass = "inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-white px-4 font-bold hover:bg-sand";

export function Dashboard({ lang }: { lang: string }) {
  const { t } = useTranslation("dashboard");
  return (
    <VendorGate lang={lang} mode="dashboard">
      {(vendor) => (
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-bold text-ink-soft">{t("title")}</p>
              <h1 className="text-4xl font-black break-words">{vendor.displayName}</h1>
            </div>
            <nav className="flex flex-wrap gap-2">
              <Link href={`/${lang}/v/${vendor.id}`} className={linkClass}>
                👀 {t("viewPublicProfile")}
              </Link>
              <Link href={`/${lang}/vendor/profile`} className={linkClass}>
                ⚙️ {t("actions.profile")}
              </Link>
            </nav>
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <GoLivePanel vendor={vendor} />
              <StatusComposer vendor={vendor} />
            </div>
            <MenuEditor vendor={vendor} />
          </div>
        </main>
      )}
    </VendorGate>
  );
}

export function ProfilePage({ lang }: { lang: string }) {
  const { t } = useTranslation("dashboard");
  return (
    <VendorGate lang={lang} mode="dashboard">
      {(vendor) => (
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
          <Link href={`/${lang}/vendor`} className="w-fit font-bold text-chile">
            ← {t("web.back")}
          </Link>
          <h1 className="text-4xl font-black">{t("settings.title")}</h1>
          {/* Keyed so a fresh copy from the server resets the form. */}
          <ProfileForm key={vendor.id} vendor={vendor} />
        </main>
      )}
    </VendorGate>
  );
}
