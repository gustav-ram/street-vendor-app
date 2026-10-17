import { createHmac } from 'node:crypto';
import { type LatLng, type Precision, roundTo } from '@streeteats/shared';

/**
 * "Approximate area" location fuzzing (PRIVACY_DESIGN.md §Location).
 *
 * The reported point is snapped to a grid cell (~180 m) and published as the
 * cell center plus a small offset that is a pure function of
 * (secret, vendor, cell). The same vendor standing at the same spot always
 * gets the same published point: across repeated queries, sessions and days.
 * There is no randomness to average away, unlike per-session random offsets,
 * which leak a vendor's regular corner once enough days are averaged.
 *
 * Hysteresis: while live, the published cell only changes once the vendor is
 * clearly inside a new cell, so the moment they cross a boundary doesn't
 * reveal where the boundary (and therefore they) were.
 */

const M_PER_DEG_LAT = 111_320;
const DEG = Math.PI / 180;

/** Offset from the cell center, so vendors sharing a cell don't stack. */
export const MAX_JITTER_M = 25;
/** How far outside its current cell a vendor may drift before the cell changes. */
export const HYSTERESIS_M = 40;

export interface FuzzOptions {
  secret: string;
  cellMeters: number;
}

export interface PublicLocation extends LatLng {
  precision: Precision;
  /** Grid cell of the published point; null for exact locations. */
  cellKey: string | null;
}

interface Cell {
  row: number;
  col: number;
  latStep: number;
  lngStep: number;
  centerLat: number;
  centerLng: number;
}

function lngStepFor(centerLat: number, cellMeters: number) {
  return cellMeters / (M_PER_DEG_LAT * Math.cos(centerLat * DEG));
}

function cellAt(p: LatLng, cellMeters: number): Cell {
  const latStep = cellMeters / M_PER_DEG_LAT;
  const row = Math.floor(p.lat / latStep);
  const centerLat = (row + 0.5) * latStep;
  // Longitude step depends only on the row, so every point in a row agrees on it.
  const lngStep = lngStepFor(centerLat, cellMeters);
  const col = Math.floor(p.lng / lngStep);
  return { row, col, latStep, lngStep, centerLat, centerLng: (col + 0.5) * lngStep };
}

function cellFromKey(key: string, cellMeters: number): Cell | null {
  const m = /^(-?\d+):(-?\d+)$/.exec(key);
  if (!m) return null;
  const row = Number(m[1]);
  const col = Number(m[2]);
  const latStep = cellMeters / M_PER_DEG_LAT;
  const centerLat = (row + 0.5) * latStep;
  const lngStep = lngStepFor(centerLat, cellMeters);
  return { row, col, latStep, lngStep, centerLat, centerLng: (col + 0.5) * lngStep };
}

function keyOf(c: Cell) {
  return `${c.row}:${c.col}`;
}

function isNearCell(c: Cell, p: LatLng, marginM: number) {
  const dLat = marginM / M_PER_DEG_LAT;
  const dLng = marginM / (M_PER_DEG_LAT * Math.cos(c.centerLat * DEG));
  return (
    p.lat >= c.row * c.latStep - dLat &&
    p.lat < (c.row + 1) * c.latStep + dLat &&
    p.lng >= c.col * c.lngStep - dLng &&
    p.lng < (c.col + 1) * c.lngStep + dLng
  );
}

export function fuzzLocation(p: LatLng, vendorId: string, opts: FuzzOptions, previousCellKey?: string | null): PublicLocation {
  let cell = cellAt(p, opts.cellMeters);
  if (previousCellKey && previousCellKey !== keyOf(cell)) {
    const prev = cellFromKey(previousCellKey, opts.cellMeters);
    if (prev && isNearCell(prev, p, HYSTERESIS_M)) cell = prev;
  }
  const cellKey = keyOf(cell);
  const h = createHmac('sha256', opts.secret).update(`${vendorId}|${cellKey}`).digest();
  const angle = (h.readUInt32BE(0) / 2 ** 32) * 2 * Math.PI;
  const radius = MAX_JITTER_M * Math.sqrt(h.readUInt32BE(4) / 2 ** 32);
  const lat = cell.centerLat + (radius * Math.cos(angle)) / M_PER_DEG_LAT;
  const lng = cell.centerLng + (radius * Math.sin(angle)) / (M_PER_DEG_LAT * Math.cos(cell.centerLat * DEG));
  return { lat: roundTo(lat, 6), lng: roundTo(lng, 6), precision: 'approximate', cellKey };
}

/** The only location that is ever stored or shown for a vendor. */
export function publicLocation(
  p: LatLng,
  precision: Precision,
  vendorId: string,
  opts: FuzzOptions,
  previousCellKey?: string | null,
): PublicLocation {
  if (precision === 'exact') {
    // ~1 m: as precise as anyone needs to find a cart.
    return { lat: roundTo(p.lat, 5), lng: roundTo(p.lng, 5), precision, cellKey: null };
  }
  return fuzzLocation(p, vendorId, opts, previousCellKey);
}

/** Great-circle distance in meters. */
export function distanceMeters(a: LatLng, b: LatLng) {
  const R = 6_371_008.8;
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
