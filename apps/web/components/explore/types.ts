import type { LatLng, SearchFilters } from "@streeteats/shared";

export type OriginLabel = { kind: "you" } | { kind: "place"; name: string } | { kind: "area" };

/** Where the search is centered. Always coarsened (~100 m) before it's stored. */
export interface Origin extends LatLng {
  label: OriginLabel;
}

export type LocateState = "idle" | "locating" | "denied" | "unavailable";

export interface ExploreFilters extends Required<SearchFilters> {
  openNow: boolean;
  radiusM: number;
}

export function activeFilterCount(f: ExploreFilters, defaults: ExploreFilters) {
  return (
    f.categories.length +
    f.priceLevels.length +
    f.paymentMethods.length +
    f.languages.length +
    (f.openNow !== defaults.openNow ? 1 : 0) +
    (f.radiusM !== defaults.radiusM ? 1 : 0)
  );
}
