"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { Favorite } from "@streeteats/shared";
import { communityApi, useAuth } from "@/lib/auth";
import { useFormat } from "@/lib/hooks/useFormat";
import { CategoryIcon, LiveLine, Rating } from "../vendor/bits";
import { buttonClass, Notice } from "../ui";

function FavoriteRow({ fav, lang }: { fav: Favorite; lang: string }) {
  const { t } = useTranslation("community");
  const { t: tv } = useTranslation("vendor");
  const { t: tc } = useTranslation("catalog");
  const f = useFormat();
  const next = fav.upcoming[0];
  return (
    <li>
      <Link href={`/${lang}/v/${fav.vendor.id}`} className="flex items-start gap-4 rounded-3xl border-2 border-ink/10 bg-white p-4 hover:border-ink">
        <CategoryIcon category={fav.vendor.categories[0]} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xl font-black break-words">{fav.vendor.displayName}</span>
          <span className="text-ink-soft">{fav.vendor.categories.map((c) => tc(`categories.${c}`)).join(" · ")}</span>
          <Rating average={fav.vendor.rating.average} count={fav.vendor.rating.count} />
          {fav.live ? (
            <LiveLine live={fav.live} />
          ) : next ? (
            <span className="font-semibold">📅 {t("favorites.next", { when: f.dayTime(next.startsAt) })}</span>
          ) : (
            <span className="text-ink-soft">{tv("closed")}</span>
          )}
          {fav.notifyOnOpen && <span className="text-sm font-bold text-ink-soft">🔔 {t("favorites.notifyOn")}</span>}
        </div>
      </Link>
    </li>
  );
}

export function FavoritesView({ lang }: { lang: string }) {
  const { t } = useTranslation("community");
  const { t: tc } = useTranslation();
  const { t: ta } = useTranslation("auth");
  const { status } = useAuth();
  const query = useQuery({ queryKey: ["favorites"], queryFn: communityApi.favorites, enabled: status === "signedIn" });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <h1 className="text-4xl font-black">♥ {t("favorites.title")}</h1>
      {status === "loading" || (status === "signedIn" && query.isPending) ? (
        <p className="text-ink-soft">{tc("status.loading")}</p>
      ) : status === "signedOut" ? (
        <>
          <p className="text-lg">{t("favorites.signIn")}</p>
          <Link href={`/${lang}/login`} className={buttonClass.primary}>
            {ta("signIn")}
          </Link>
        </>
      ) : query.isError ? (
        <Notice tone="error">{tc("status.serverDown")}</Notice>
      ) : query.data!.favorites.length === 0 ? (
        <p className="text-lg text-ink-soft">{t("favorites.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {query.data!.favorites.map((fav) => (
            <FavoriteRow key={fav.vendor.id} fav={fav} lang={lang} />
          ))}
        </ul>
      )}
    </main>
  );
}
