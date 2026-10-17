"use client";

import { useTranslation } from "react-i18next";
import type { LiveResult, UpcomingResult } from "@streeteats/shared";
import { VendorRow } from "./VendorRow";

export function ResultList(props: {
  live: LiveResult[];
  upcoming: UpcomingResult[];
  showingUpcoming: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onShowUpcoming: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation("search");
  const { t: tc } = useTranslation();

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

  return (
    <div className="flex flex-col">
      <h2 className="px-4 pt-4 pb-2 text-lg font-extrabold" aria-live="polite">
        {t("results", { count: props.live.length })}
      </h2>
      {props.live.length === 0 && (
        <div className="flex flex-col items-start gap-3 px-4 pb-4">
          <p className="text-lg font-semibold">{t("noResults")}</p>
          <p className="text-ink-soft">{t("noResultsHint")}</p>
          {!props.showingUpcoming && (
            <button type="button" onClick={props.onShowUpcoming} className="min-h-11 rounded-full border-2 border-ink px-4 font-bold">
              {t("showUpcoming")}
            </button>
          )}
        </div>
      )}
      <ul>
        {props.live.map((v) => (
          <VendorRow key={v.id} vendor={v} selected={props.selectedId === v.id} onSelect={props.onSelect} />
        ))}
      </ul>
      {props.showingUpcoming && props.upcoming.length > 0 && (
        <>
          <h2 className="px-4 pt-6 pb-2 text-lg font-extrabold">{t("upcomingTitle")}</h2>
          <ul>
            {props.upcoming.map((v) => (
              <VendorRow key={v.id} vendor={v} selected={props.selectedId === v.id} onSelect={props.onSelect} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
