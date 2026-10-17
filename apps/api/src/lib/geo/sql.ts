import { type SQL, sql } from 'drizzle-orm';
import type { LatLng } from '@streeteats/shared';

/** A geography(Point, 4326) literal. PostGIS takes (lng, lat). */
export function pointSql(p: LatLng): SQL {
  return sql`ST_SetSRID(ST_MakePoint(${p.lng}::double precision, ${p.lat}::double precision), 4326)::geography`;
}

/** Selects lat/lng columns out of a geography point column. */
export function latSql(column: SQL | { name: string }) {
  return sql<number>`ST_Y(${column}::geometry)`;
}

export function lngSql(column: SQL | { name: string }) {
  return sql<number>`ST_X(${column}::geometry)`;
}
