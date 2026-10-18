import { LIMITS } from './constants';

/**
 * Picking a "where I'll be" time window on the vendor's device: a day
 * (0 = today, 1 = tomorrow ...) and two clock times, in the device's own
 * time zone. An end time earlier than the start means it runs past midnight.
 */

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function at(base: Date, dayOffset: number, hhmm: string) {
  const m = HHMM.exec(hhmm);
  if (!m) throw new Error('bad time');
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, Number(m[1]), Number(m[2]));
}

export function windowFromPicker(dayOffset: number, start: string, end: string, now = new Date()) {
  const startsAt = at(now, dayOffset, start);
  let endsAt = at(now, dayOffset, end);
  const overnight = endsAt <= startsAt;
  if (overnight) endsAt = at(now, dayOffset + 1, end);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), overnight };
}

/** Whole days between today and that date, on the device's calendar. */
export function dayOffsetOf(iso: string, now = new Date()) {
  const d = new Date(iso);
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  return Math.round((day(d) - day(now)) / 86_400_000);
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The picker values for an existing post. */
export function pickerFromWindow(startsAt: string, endsAt: string, now = new Date()) {
  return { dayOffset: Math.max(0, dayOffsetOf(startsAt, now)), start: hhmm(new Date(startsAt)), end: hhmm(new Date(endsAt)) };
}

/** Why the window can't be posted, if it can't. */
export function windowProblem(startsAt: string, endsAt: string, now = new Date()): 'tooLong' | 'ended' | null {
  const s = Date.parse(startsAt);
  const e = Date.parse(endsAt);
  if (e <= now.getTime()) return 'ended';
  if (e - s > LIMITS.upcomingWindowMaxHours * 3_600_000) return 'tooLong';
  return null;
}
