"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";

export function AccountLinks({ lang }: { lang: string }) {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation();
  const { t: td } = useTranslation("dashboard");
  const { status, me, signOut } = useAuth();

  if (status === "loading") return null;
  if (status === "signedIn" && me) {
    return (
      <nav className="flex items-center gap-3 text-base font-bold">
        {me.role === "vendor" && (
          <Link href={`/${lang}/vendor`} className="rounded-full bg-chile px-4 py-2 text-white">
            {td("title")}
          </Link>
        )}
        <button type="button" onClick={() => void signOut()} className="underline-offset-4 hover:underline">
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
