export interface LatLng {
  lat: number;
  lng: number;
}

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Customer locations are coarsened before they leave the device:
 * 3 decimals is roughly 110 m, which is plenty for "what's near me".
 */
export const CUSTOMER_COORD_DECIMALS = 3;

export function coarsenCustomerLocation(p: LatLng): LatLng {
  return { lat: roundTo(p.lat, CUSTOMER_COORD_DECIMALS), lng: roundTo(p.lng, CUSTOMER_COORD_DECIMALS) };
}
