"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type Place, searchPlaces } from "@streeteats/shared";
import type { LocateState, Origin } from "./types";

/** Shows where results are centered; lets people share location or pick an area. */
export function LocationBar({
  origin,
  locateState,
  onLocate,
  onPick,
}: {
  origin: Origin;
  locateState: LocateState;
  onLocate: () => void;
  onPick: (place: Place) => void;
}) {
  const { t } = useTranslation("search");
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  // Matching runs on this device: what someone types here is never sent anywhere.
  const places = searchPlaces(query, 6);

  const where =
    origin.label.kind === "you"
      ? t("location.nearYou")
      : t("location.near", { place: origin.label.kind === "place" ? origin.label.name : t("location.mapCenter") });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">📍 {where}</span>
        <button
          type="button"
          onClick={onLocate}
          disabled={locateState === "locating"}
          className="min-h-10 rounded-full border-2 border-ink/30 px-3 text-sm font-bold hover:border-ink disabled:opacity-60"
        >
          {locateState === "locating" ? t("location.locating") : t("location.useMine")}
        </button>
        <button
          type="button"
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
          className="min-h-10 rounded-full border-2 border-ink/30 px-3 text-sm font-bold hover:border-ink"
        >
          {t("location.choose")}
        </button>
      </div>
      {(locateState === "denied" || locateState === "unavailable") && (
        <p role="alert" className="text-sm font-semibold text-chile">
          {locateState === "denied" ? t("location.denied") : t("location.unavailable")}
        </p>
      )}
      {(picking || locateState === "denied") && (
        <div className="rounded-2xl border-2 border-ink/20 bg-white p-2">
          <input
            autoFocus={picking}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("location.placeholder")}
            aria-label={t("location.placeholder")}
            className="min-h-11 w-full rounded-xl border border-ink/20 px-3"
          />
          <ul className="mt-1">
            {places.map((p) => (
              <li key={p.name}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setPicking(false);
                    setQuery("");
                  }}
                  className="min-h-11 w-full rounded-lg px-3 text-left hover:bg-sand"
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-ink-soft">{t("location.privacy")}</p>
    </div>
  );
}
