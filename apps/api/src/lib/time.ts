// Small timezone helpers built on Intl, so vendor-local times ("tomorrow
// 4-9pm", "end of the street day at 3am") are computed in the vendor's zone.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ''),
  };
}

function offsetMs(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant at which the wall clock in `timeZone` shows the given time. */
export function zonedTime(
  y: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(y, month - 1, day, hour, minute);
  const first = offsetMs(new Date(guess), timeZone);
  const second = offsetMs(new Date(guess - first), timeZone);
  return new Date(guess - second);
}

/** YYYY-MM-DD of `date` in `timeZone`. */
export function localDay(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Wall-clock time `hh:mm` on the local day `daysFromToday` days after `now`. */
export function localTimeOnDay(now: Date, daysFromToday: number, hhmm: string, timeZone: string): Date {
  const p = zonedParts(now, timeZone);
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  // Date.UTC normalizes day overflow (e.g. Oct 32 -> Nov 1).
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + daysFromToday));
  return zonedTime(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, m, timeZone);
}
