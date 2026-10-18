"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { dayOffsetOf, type LiveResult, type UpcomingResult } from "@streeteats/shared";
import { communityApi, useAuth } from "@/lib/auth";
import { useFormat } from "@/lib/hooks/useFormat";
import type { ExploreMode } from "./types";
import { VendorRow } from "./VendorRow";

/** "Today", "Tomorrow" or the weekday, for grouping upcoming spots. */
function useDayLabel() {
  const { t } = useTranslation("search");
  const f = useFormat();
  return (iso: string) => {
    const d = dayOffsetOf(iso);
    return d <= 0 ? t("days.today") : d === 1 ? t("days.tomorrow") : f.weekday(new Date(iso).getDay());
  };
}

export function ResultList(props: {
  live: LiveResult[];
  upcoming: UpcomingResult[];
  mode: ExploreMode;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onShowUpcoming: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation("search");
  const { t: tc } = useTranslation();
  const dayLabel = useDayLabel();

  if (props.loading) return <p className="p-4 text-ink-soft">{tc("status.loading")}</p>;
  if (props.error) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <p role="alert">{t("error")}</p>
        <button type="button" onClick={props.onRetry} className="min-h-11 rounded-full bg-ink px-5 font-bold text-white">
          {tc("actions.retry")}
        </button>
      </div>
    );
  }

  if (props.mode === "upcoming") {
    // Results come sorted by start time, so grouping keeps the days in order.
    const groups = new Map<string, UpcomingResult[]>();
    for (const v of props.upcoming) {
      const label = dayLabel(v.spot.startsAt);
      groups.set(label, [...(groups.get(label) ?? []), v]);
    }
    return (
      <div className="flex flex-col">
        <FavoritesUpcoming />
        <h2 className="px-4 pt-4 pb-2 text-lg font-extrabold" aria-live="polite">
          {t("upcomingResults", { count: props.upcoming.length })}
        </h2>
        {props.upcoming.length === 0 && (
          <div className="flex flex-col gap-2 px-4 pb-4">
            <p className="text-lg font-semibold">{t("upcomingEmpty")}</p>
            <p className="text-ink-soft">{t("upcomingHint")}</p>
          </div>
        )}
        {[...groups].map(([label, vendors]) => (
          <section key={label}>
            <h3 className="bg-sand/60 px-4 py-2 font-black">{label}</h3>
            <ul>
              {vendors.map((v) => (
                <VendorRow key={v.id} vendor={v} selected={props.selectedId === v.id} onSelect={props.onSelect} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <h2 className="px-4 pt-4 pb-2 text-lg font-extrabold" aria-live="polite">
        {t("results", { count: props.live.length })}
      </h2>
      {props.live.length === 0 && (
        <div className="flex flex-col items-start gap-3 px-4 pb-4">
          <p className="text-lg font-semibold">{t("noResults")}</p>
          <p className="text-ink-soft">{t("noResultsHint")}</p>
          <button type="button" onClick={props.onShowUpcoming} className="min-h-11 rounded-full border-2 border-ink px-4 font-bold">
            {t("showUpcoming")}
          </button>
        </div>
      )}
      <ul>
        {props.live.map((v) => (
          <VendorRow key={v.id} vendor={v} selected={props.selectedId === v.id} onSelect={props.onSelect} />
        ))}
      </ul>
    </div>
  );
}

/** Where saved vendors will be next, wherever that is. Only for signed-in customers. */
function FavoritesUpcoming() {
  const { t } = useTranslation("search");
  const { status } = useAuth();
  const f = useFormat();
  const dayLabel = useDayLabel();
  const { lang } = useParams<{ lang: string }>();
  const favs = useQuery({ queryKey: ["favorites"], queryFn: communityApi.favorites, enabled: status === "signedIn" });
  const planned = (favs.data?.favorites ?? []).filter((x) => x.upcoming.length > 0);
  if (planned.length === 0) return null;
  return (
    <section className="border-b-2 border-sand bg-marigold/10 px-4 py-3">
      <h2 className="mb-2 text-lg font-extrabold">♥ {t("fromFavorites")}</h2>
      <ul className="flex flex-col gap-2">
        {planned.map(({ vendor, upcoming: [next] }) => (
          <li key={vendor.id}>
            <Link href={`/${lang}/v/${vendor.id}`} className="block rounded-xl bg-white px-3 py-2 hover:bg-sand">
              <span className="block font-extrabold">{vendor.displayName}</span>
              <span className="text-sm text-ink-soft">
                {dayLabel(next!.startsAt)} · {t("upcoming.when", { start: f.time(next!.startsAt), end: f.time(next!.endsAt) })}
                {next!.placeLabel ? ` · ${next!.placeLabel}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
