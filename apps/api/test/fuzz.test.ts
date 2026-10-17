import { describe, expect, it } from 'vitest';
import { distanceMeters, fuzzLocation, HYSTERESIS_M, MAX_JITTER_M, publicLocation } from '../src/lib/geo/fuzz';

const opts = { secret: 'test-secret-0123456789abcdef0123456789', cellMeters: 180 };
const vendor = '6f1c5a3e-7d2b-4c1e-9a7b-1f2e3d4c5b6a';
const otherVendor = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
// Worst case without hysteresis: corner of the cell + the offset.
const maxError = (opts.cellMeters / 2) * Math.SQRT2 + MAX_JITTER_M;

// Deterministic pseudo-random points around LA.
function* points(n: number, seed = 7) {
  let s = seed;
  const next = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < n; i++) yield { lat: 33.7 + next() * 0.6, lng: -118.6 + next() * 0.7 };
}

describe('approximate location fuzzing', () => {
  it('always publishes a point within ~150 m of the true spot', () => {
    for (const p of points(2000)) {
      const out = fuzzLocation(p, vendor, opts);
      expect(distanceMeters(p, out)).toBeLessThanOrEqual(maxError + 0.5);
    }
    expect(maxError).toBeLessThan(155);
  });

  it('is deterministic: repeated queries and sessions give the same point', () => {
    const spot = { lat: 34.0431, lng: -118.2667 };
    const outputs = new Set(Array.from({ length: 50 }, () => JSON.stringify(fuzzLocation(spot, vendor, opts))));
    expect(outputs.size).toBe(1);
  });

  it('cannot be averaged: every spot inside a cell maps to one published point', () => {
    const spot = { lat: 34.0431, lng: -118.2667 };
    const base = fuzzLocation(spot, vendor, opts);
    const published = new Set<string>();
    // Small moves (the cart shifting a few meters) that stay in the cell.
    for (let i = 0; i < 200; i++) {
      const p = { lat: spot.lat + (Math.random() - 0.5) * 0.0002, lng: spot.lng + (Math.random() - 0.5) * 0.0002 };
      const out = fuzzLocation(p, vendor, opts, base.cellKey);
      published.add(`${out.lat},${out.lng}`);
    }
    expect(published.size).toBe(1);
    // The published point is not the true spot.
    expect(distanceMeters(spot, base)).toBeGreaterThan(1);
  });

  it('gives different vendors in the same cell different points (no stacked pins)', () => {
    const spot = { lat: 34.0574, lng: -118.2376 };
    const a = fuzzLocation(spot, vendor, opts);
    const b = fuzzLocation(spot, otherVendor, opts);
    expect(a.cellKey).toBe(b.cellKey);
    expect(`${a.lat},${a.lng}`).not.toBe(`${b.lat},${b.lng}`);
  });

  it('depends on the server secret', () => {
    const spot = { lat: 34.0574, lng: -118.2376 };
    const a = fuzzLocation(spot, vendor, opts);
    const b = fuzzLocation(spot, vendor, { ...opts, secret: 'another-secret-0123456789abcdef01234567' });
    expect(a.cellKey).toBe(b.cellKey);
    expect(`${a.lat},${a.lng}`).not.toBe(`${b.lat},${b.lng}`);
  });

  it('keeps the current cell for small moves across a boundary (hysteresis)', () => {
    // Walk east in 5 m steps from a starting spot until the raw cell changes.
    const start = { lat: 34.05, lng: -118.25 };
    const first = fuzzLocation(start, vendor, opts);
    const metersToLng = (m: number) => m / (111_320 * Math.cos((start.lat * Math.PI) / 180));
    let step = 0;
    let crossed = start;
    while (fuzzLocation(crossed, vendor, opts).cellKey === first.cellKey) {
      step += 1;
      crossed = { lat: start.lat, lng: start.lng + metersToLng(step * 5) };
    }
    // Just past the boundary: still published in the old cell.
    const justPast = fuzzLocation(crossed, vendor, opts, first.cellKey);
    expect(justPast.cellKey).toBe(first.cellKey);
    expect(distanceMeters(crossed, justPast)).toBeLessThanOrEqual(maxError + HYSTERESIS_M * Math.SQRT2);
    // Well past the boundary: switches to the new cell.
    const wellPast = { lat: start.lat, lng: crossed.lng + metersToLng(HYSTERESIS_M + 10) };
    expect(fuzzLocation(wellPast, vendor, opts, first.cellKey).cellKey).not.toBe(first.cellKey);
  });

  it('exact mode only rounds to ~1 m and has no cell', () => {
    const out = publicLocation({ lat: 34.0431234, lng: -118.2667891 }, 'exact', vendor, opts);
    expect(out).toEqual({ lat: 34.04312, lng: -118.26679, precision: 'exact', cellKey: null });
  });
});
