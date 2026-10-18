import { describe, expect, it } from 'vitest';
import { dayOffsetOf, pickerFromWindow, windowFromPicker, windowProblem } from './upcoming';

const now = new Date(2026, 9, 18, 10, 0); // Sunday 10:00 local

describe('upcoming window picker', () => {
  it('builds a window on the chosen day in local time', () => {
    const w = windowFromPicker(1, '17:00', '21:30', now);
    expect(new Date(w.startsAt)).toEqual(new Date(2026, 9, 19, 17, 0));
    expect(new Date(w.endsAt)).toEqual(new Date(2026, 9, 19, 21, 30));
    expect(w.overnight).toBe(false);
  });

  it('runs past midnight when the end is earlier than the start', () => {
    const w = windowFromPicker(0, '18:00', '01:00', now);
    expect(new Date(w.endsAt)).toEqual(new Date(2026, 9, 19, 1, 0));
    expect(w.overnight).toBe(true);
  });

  it('reads an existing post back into the picker', () => {
    const w = windowFromPicker(2, '06:15', '11:45', now);
    expect(pickerFromWindow(w.startsAt, w.endsAt, now)).toEqual({ dayOffset: 2, start: '06:15', end: '11:45' });
    expect(dayOffsetOf(new Date(2026, 9, 18, 23, 59).toISOString(), now)).toBe(0);
    expect(dayOffsetOf(new Date(2026, 9, 19, 0, 1).toISOString(), now)).toBe(1);
  });

  it('flags windows that are too long or already over', () => {
    const long = windowFromPicker(1, '06:00', '23:00', now);
    expect(windowProblem(long.startsAt, long.endsAt, now)).toBe('tooLong');
    const past = windowFromPicker(0, '06:00', '09:00', now);
    expect(windowProblem(past.startsAt, past.endsAt, now)).toBe('ended');
    const ok = windowFromPicker(0, '16:00', '21:00', now);
    expect(windowProblem(ok.startsAt, ok.endsAt, now)).toBeNull();
  });
});
