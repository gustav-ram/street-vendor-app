"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";

export function AccountLinks({ lang }: { lang: string }) {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation();
  const { t: td } = useTranslation("dashboard");
  const { t: tm } = useTranslation("community");
  const { t: tad } = useTranslation("admin");
  const { status, me } = useAuth();
  const privacy = (
    <Link href={`/${lang}/privacy`} className="underline-offset-4 hover:underline" title={tc("nav.privacy")}>
      🔒<span className="hidden lg:inline"> {tc("nav.privacy")}</span>
    </Link>
  );

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
        {privacy}
        {/* Sign out, download and delete live on the account page. */}
        <Link href={`/${lang}/account`} className="underline-offset-4 hover:underline" title={tc("nav.account")}>
          👤<span className="hidden sm:inline"> {tc("nav.account")}</span>
        </Link>
      </nav>
    );
  }
  return (
    <nav className="flex items-center gap-3 text-base font-bold">
      {privacy}
      <Link href={`/${lang}/signup?role=vendor`} className="hidden text-chile hover:underline sm:inline">
        {tc("nav.forVendors")}
      </Link>
      <Link href={`/${lang}/login`} className="rounded-full border-2 border-ink px-4 py-2">
        {t("signIn")}
      </Link>
    </nav>
  );
}
