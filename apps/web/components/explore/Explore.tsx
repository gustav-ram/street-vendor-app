"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { coarsenCustomerLocation, DEFAULT_PLACE, DEFAULT_RADIUS_M, type LatLng } from "@streeteats/shared";
import { api } from "@/lib/api";
import { FiltersDialog } from "./FiltersDialog";
import { LocationBar } from "./LocationBar";
import { ResultList } from "./ResultList";
import { SearchBar } from "./SearchBar";
import { SelectedCard } from "./SelectedCard";
import { activeFilterCount, type ExploreFilters, type LocateState, type Origin } from "./types";

// Leaflet touches `window`, so the map only renders in the browser.
const VendorMap = dynamic(() => import("./VendorMap"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-sand" />,
});

export const DEFAULT_FILTERS: ExploreFilters = {
  categories: [],
  priceLevels: [],
  paymentMethods: [],
  languages: [],
  openNow: true,
  radiusM: DEFAULT_RADIUS_M,
};

export function Explore() {
  const { t, i18n } = useTranslation("search");
  const [origin, setOrigin] = useState<Origin>({ lat: DEFAULT_PLACE.lat, lng: DEFAULT_PLACE.lng, label: { kind: "place", name: DEFAULT_PLACE.name } });
  const [locateState, setLocateState] = useState<LocateState>("idle");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<ExploreFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<"map" | "list">("map");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);

  const moveTo = useCallback((p: LatLng, label: Origin["label"]) => {
    // Coarsen before the location goes anywhere, even into state.
    setOrigin({ ...coarsenCustomerLocation(p), label });
    setMapCenter(null);
    setSelectedId(null);
  }, []);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) return setLocateState("unavailable");
    setLocateState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocateState("idle");
        moveTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }, { kind: "you" });
      },
      (err) => setLocateState(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [moveTo]);

  // Only locate automatically if the browser already allows it; otherwise
  // the "Use my location" button asks, and nothing is requested on load.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((status) => {
        if (status.state === "granted") locate();
      })
      .catch(() => {});
  }, [locate]);

  const include = filters.openNow ? (["live"] as const) : (["live", "upcoming"] as const);
  const search = useQuery({
    queryKey: ["search", origin.lat, origin.lng, q, filters],
    queryFn: () =>
      api.search({
        location: { lat: origin.lat, lng: origin.lng },
        radiusM: filters.radiusM,
        q: q || undefined,
        filters: {
          categories: filters.categories,
          priceLevels: filters.priceLevels,
          paymentMethods: filters.paymentMethods,
          languages: filters.languages,
        },
        include: [...include],
      }),
    placeholderData: keepPreviousData,
  });

  const live = useMemo(() => search.data?.live ?? [], [search.data]);
  const upcoming = useMemo(() => search.data?.upcoming ?? [], [search.data]);
  const selected = live.find((v) => v.id === selectedId) ?? upcoming.find((v) => v.id === selectedId) ?? null;
  const filterCount = activeFilterCount(filters, DEFAULT_FILTERS);

  return (
    <div className="flex h-[calc(100dvh-var(--header-h))] min-h-0 flex-col md:flex-row">
      <aside className="flex min-h-0 flex-col border-sand md:w-[440px] md:border-r-2">
        <div className="flex flex-col gap-3 border-b-2 border-sand p-4">
          <SearchBar initial={q} onSubmit={setQ} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className={`min-h-11 rounded-full border-2 px-4 font-bold ${filterCount ? "border-ink bg-ink text-white" : "border-ink bg-white"}`}
            >
              {filterCount ? t("filtersActive", { count: filterCount }) : t("filters")}
            </button>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-ink bg-white px-4 font-bold">
              <input
                type="checkbox"
                className="size-5 accent-live"
                checked={filters.openNow}
                onChange={(e) => setFilters((f) => ({ ...f, openNow: e.target.checked }))}
              />
              {t("openNow")}
            </label>
            <div role="group" aria-label={t("view.map") + " / " + t("view.list")} className="ml-auto flex rounded-full border-2 border-ink p-0.5 md:hidden">
              {(["map", "list"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`min-h-10 rounded-full px-4 font-bold ${view === v ? "bg-ink text-white" : ""}`}
                >
                  {t(`view.${v}`)}
                </button>
              ))}
            </div>
          </div>
          <LocationBar origin={origin} locateState={locateState} onLocate={locate} onPick={(p) => moveTo(p, { kind: "place", name: p.name })} />
          {search.data?.matchedTags.length ? (
            <p className="text-sm text-ink-soft">
              {t("understoodAs", { tags: search.data.matchedTags.map((tag) => (i18n.language === "es" ? tag.nameEs : tag.nameEn)).join(" · ") })}
            </p>
          ) : null}
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${view === "map" ? "hidden md:block" : ""}`}>
          <ResultList
            live={live}
            upcoming={upcoming}
            showingUpcoming={!filters.openNow}
            loading={search.isPending}
            error={search.isError}
            onRetry={() => void search.refetch()}
            onShowUpcoming={() => setFilters((f) => ({ ...f, openNow: false }))}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setView("map");
            }}
          />
        </div>
      </aside>

      <section className={`relative min-h-[60vh] flex-1 md:min-h-0 ${view === "list" ? "hidden md:block" : ""}`}>
        <VendorMap
          origin={origin}
          live={live}
          upcoming={upcoming}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMoved={setMapCenter}
        />
        {mapCenter && (
          <button
            type="button"
            onClick={() => moveTo(mapCenter, { kind: "area" })}
            className="absolute top-4 left-1/2 z-[500] min-h-11 -translate-x-1/2 rounded-full bg-ink px-5 font-bold text-white shadow-lg"
          >
            🔍 {t("location.searchThisArea")}
          </button>
        )}
        {selected && <SelectedCard vendor={selected} onClose={() => setSelectedId(null)} />}
      </section>

      <FiltersDialog
        open={filtersOpen}
        value={filters}
        defaults={DEFAULT_FILTERS}
        onClose={() => setFiltersOpen(false)}
        onApply={(f) => {
          setFilters(f);
          setFiltersOpen(false);
        }}
      />
    </div>
  );
}
