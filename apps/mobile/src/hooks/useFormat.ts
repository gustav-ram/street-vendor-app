import { getLocales } from 'expo-localization';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatClock,
  formatDayTime,
  formatDistance,
  formatPrice,
  formatRadius,
  formatTime,
  weekdayName,
} from '@streeteats/shared';

/** Formatting bound to the UI language; miles unless the phone uses metric. */
export function useFormat() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useMemo(() => {
    const device = getLocales()[0];
    const miles = device?.measurementSystem !== 'metric';
    const locale = lang === 'es' ? 'es-US' : 'en-US';
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
