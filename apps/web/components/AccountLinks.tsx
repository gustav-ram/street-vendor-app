"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { goOffline, isLiveHere } from "@/lib/live";

export function AccountLinks({ lang }: { lang: string }) {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation();
  const { t: td } = useTranslation("dashboard");
  const { t: tm } = useTranslation("community");
  const { t: tad } = useTranslation("admin");
  const { status, me, signOut } = useAuth();

  if (status === "loading") return null;
  if (status === "signedIn" && me) {
    return (
      <nav className="flex items-center gap-3 text-base font-bold">
        <Link href={`/${lang}/favorites`} className="hidden underline-offset-4 hover:underline sm:inline">
          ♥ {tm("favorites.title")}
        </Link>
        {me.role === "admin" && (
          <Link href={`/${lang}/admin`} className="rounded-full bg-ink px-4 py-2 text-white">
            {tad("title")}
          </Link>
        )}
        {me.role === "vendor" && (
          <Link href={`/${lang}/vendor`} className="rounded-full bg-chile px-4 py-2 text-white">
            {td("title")}
          </Link>
        )}
        <button
          type="button"
          onClick={async () => {
            // Signing out closes the stand first, so the location isn't left up for the grace period.
            if (isLiveHere()) await goOffline();
            await signOut();
          }}
          className="underline-offset-4 hover:underline"
        >
          {t("signOut")}
        </button>
      </nav>
    );
  }
  return (
    <nav className="flex items-center gap-3 text-base font-bold">
      <Link href={`/${lang}/signup?role=vendor`} className="hidden text-chile hover:underline sm:inline">
        {tc("nav.forVendors")}
      </Link>
      <Link href={`/${lang}/login`} className="rounded-full border-2 border-ink px-4 py-2">
        {t("signIn")}
      </Link>
    </nav>
  );
}
