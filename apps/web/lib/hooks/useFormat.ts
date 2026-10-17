"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  formatDistance,
  formatPrice,
  formatRadius,
  formatTime,
  formatDayTime,
  formatClock,
  prefersMiles,
  weekdayName,
} from "@streeteats/shared";

/** Formatting bound to the UI language, with miles for US browsers. */
export function useFormat() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useMemo(() => {
    const browser = typeof navigator === "undefined" ? "en-US" : navigator.language;
    const region = browser.split("-")[1] ?? null;
    const miles = prefersMiles(region);
    // Keep US conventions (12-hour clock, $) for both languages in LA.
    const locale = lang === "es" ? "es-US" : "en-US";
    return {
      locale,
      miles,
      price: (cents: number) => formatPrice(cents, locale),
      distance: (m: number) => formatDistance(m, miles, locale),
      radius: (m: number) => formatRadius(m, miles, locale),
      time: (iso: string) => formatTime(iso, locale),
      dayTime: (iso: string) => formatDayTime(iso, locale),
      clock: (hhmmss: string) => formatClock(hhmmss, locale),
      weekday: (d: number) => weekdayName(d, locale),
    };
  }, [lang]);
}
