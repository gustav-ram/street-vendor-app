// Locale-aware formatting shared by the web and mobile apps.

/** What a vendor types for a price ("7.50", "7,50", "$7") -> 750 cents, or null if it isn't one. */
export function parsePriceToCents(input: string): number | null {
  const cleaned = input.replace(/[$\s]/g, '').replace(',', '.');
  if (!/^\d{1,4}(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** Cents back into an editable price ("7", "7.50"). */
export function centsToInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function formatPrice(cents: number, locale: string): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Miles for the US (and the UK's road signs), kilometers elsewhere. */
export function prefersMiles(regionCode: string | null | undefined): boolean {
  return !regionCode || ['US', 'GB', 'LR', 'MM'].includes(regionCode.toUpperCase());
}

export function formatDistance(meters: number, miles: boolean, locale: string): string {
  if (miles) {
    const mi = meters / 1609.344;
    const value = mi < 10 ? Math.max(0.1, Math.round(mi * 10) / 10) : Math.round(mi);
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} mi`;
  }
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  const km = meters / 1000;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km)} km`;
}

export function formatRadius(meters: number, miles: boolean, locale: string): string {
  return miles
    ? `${new Intl.NumberFormat(locale).format(Math.round(meters / 1609.344))} mi`
    : `${new Intl.NumberFormat(locale).format(Math.round(meters / 1000))} km`;
}

/** Whole minutes between an ISO timestamp and now (never negative). */
export function minutesAgo(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function formatTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function formatDayTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** "16:30:00" -> localized "4:30 PM". */
export function formatClock(hhmmss: string, locale: string): string {
  const [h = 0, m = 0] = hhmmss.split(':').map(Number);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, 0, 1, h, m)),
  );
}

/** Localized weekday name for 0 = Sunday ... 6 = Saturday. */
export function weekdayName(weekday: number, locale: string, style: 'long' | 'short' = 'long'): string {
  // 2000-01-02 was a Sunday.
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 2 + weekday)));
}
