import type { LatLng, SearchFilters } from "@streeteats/shared";

export type OriginLabel = { kind: "you" } | { kind: "place"; name: string } | { kind: "area" };

/** Where the search is centered. Always coarsened (~100 m) before it's stored. */
export interface Origin extends LatLng {
  label: OriginLabel;
}

export type LocateState = "idle" | "locating" | "denied" | "unavailable";

export interface ExploreFilters extends Required<SearchFilters> {
  radiusM: number;
}

/** The two tabs on the map: who's open right now, and who's coming (tomorrow posts, schedules). */
export type ExploreMode = "now" | "upcoming";

export function activeFilterCount(f: ExploreFilters, defaults: ExploreFilters) {
  return (
    f.categories.length +
    f.priceLevels.length +
    f.paymentMethods.length +
    f.languages.length +
    (f.radiusM !== defaults.radiusM ? 1 : 0)
  );
}
