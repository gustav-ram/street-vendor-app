import { useSyncExternalStore } from 'react';
import {
  coarsenCustomerLocation,
  DEFAULT_PLACE,
  DEFAULT_RADIUS_M,
  type LatLng,
  type SearchFilters,
} from '@streeteats/shared';

// Tiny shared store for the explore screen and the filters sheet.

export type OriginLabel = { kind: 'you' } | { kind: 'place'; name: string } | { kind: 'area' };
export interface Origin extends LatLng {
  label: OriginLabel;
}

export interface ExploreFilters extends Required<SearchFilters> {
  openNow: boolean;
  radiusM: number;
}

export const DEFAULT_FILTERS: ExploreFilters = {
  categories: [],
  priceLevels: [],
  paymentMethods: [],
  languages: [],
  openNow: true,
  radiusM: DEFAULT_RADIUS_M,
};

interface ExploreState {
  origin: Origin;
  filters: ExploreFilters;
}

let state: ExploreState = {
  origin: { lat: DEFAULT_PLACE.lat, lng: DEFAULT_PLACE.lng, label: { kind: 'place', name: DEFAULT_PLACE.name } },
  filters: DEFAULT_FILTERS,
};
const listeners = new Set<() => void>();

function set(patch: Partial<ExploreState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const exploreStore = {
  /** The location is coarsened to ~100 m before it's kept anywhere. */
  setOrigin: (p: LatLng, label: OriginLabel) => set({ origin: { ...coarsenCustomerLocation(p), label } }),
  setFilters: (filters: ExploreFilters) => set({ filters }),
};

export function useExplore(): ExploreState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function activeFilterCount(f: ExploreFilters) {
  return (
    f.categories.length +
    f.priceLevels.length +
    f.paymentMethods.length +
    f.languages.length +
    (f.openNow !== DEFAULT_FILTERS.openNow ? 1 : 0) +
    (f.radiusM !== DEFAULT_FILTERS.radiusM ? 1 : 0)
  );
}
