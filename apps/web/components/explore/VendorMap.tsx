"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Fragment, useEffect, useMemo } from "react";
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { CATEGORY_EMOJI, type LatLng, type LiveResult, type UpcomingResult } from "@streeteats/shared";
import type { Origin } from "./types";

// Approximate-area circle drawn around fuzzed points (see PLAN.md §6.1).
const APPROX_RADIUS_M = 150;
const MOVE_THRESHOLD_M = 400;

function pinIcon(emoji: string, opts: { selected: boolean; upcoming: boolean }) {
  return L.divIcon({
    className: "se-pin-wrap",
    html: `<div class="se-pin${opts.selected ? " is-selected" : ""}${opts.upcoming ? " is-upcoming" : ""}">${emoji}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function FollowOrigin({ origin }: { origin: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView([origin.lat, origin.lng], Math.max(map.getZoom(), 13), { animate: true });
  }, [map, origin.lat, origin.lng]);
  return null;
}

function FocusSelected({ point }: { point: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.panTo([point.lat, point.lng], { animate: true });
  }, [map, point]);
  return null;
}

/**
 * Reports the map center after the person drags it far enough, for "Search
 * this area". Programmatic moves (following a selection) don't count.
 */
function MoveWatcher({ origin, onMoved }: { origin: LatLng; onMoved: (c: LatLng | null) => void }) {
  const map = useMapEvents({
    dragend() {
      const c = map.getCenter();
      const far = map.distance(c, [origin.lat, origin.lng]) > MOVE_THRESHOLD_M;
      onMoved(far ? { lat: c.lat, lng: c.lng } : null);
    },
  });
  return null;
}

export default function VendorMap({
  origin,
  live,
  upcoming,
  selectedId,
  onSelect,
  onMoved,
}: {
  origin: Origin;
  live: LiveResult[];
  upcoming: UpcomingResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMoved: (center: LatLng | null) => void;
}) {
  const pins = useMemo(
    () => [
      ...live.map((v) => ({ id: v.id, name: v.displayName, emoji: CATEGORY_EMOJI[v.categories[0] ?? "other"], loc: v.live.location, upcoming: false })),
      ...upcoming.flatMap((v) =>
        v.spot.location
          ? [{ id: v.id, name: v.displayName, emoji: CATEGORY_EMOJI[v.categories[0] ?? "other"], loc: v.spot.location, upcoming: true }]
          : [],
      ),
    ],
    [live, upcoming],
  );
  const selected = pins.find((p) => p.id === selectedId) ?? null;

  return (
    <MapContainer center={[origin.lat, origin.lng]} zoom={13} className="size-full" zoomControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FollowOrigin origin={origin} />
      <FocusSelected point={selected?.loc ?? null} />
      <MoveWatcher origin={origin} onMoved={onMoved} />
      {origin.label.kind === "you" && (
        <CircleMarker center={[origin.lat, origin.lng]} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }} />
      )}
      {pins.map((p) => (
        <Fragment key={`${p.upcoming ? "u" : "l"}-${p.id}`}>
          {p.loc.precision === "approximate" && (
            <Circle
              center={[p.loc.lat, p.loc.lng]}
              radius={APPROX_RADIUS_M}
              pathOptions={{ color: p.upcoming ? "#5b5048" : "#b42318", weight: 1, fillOpacity: 0.08, dashArray: p.upcoming ? "4 4" : undefined }}
            />
          )}
          <Marker
            position={[p.loc.lat, p.loc.lng]}
            icon={pinIcon(p.emoji, { selected: p.id === selectedId, upcoming: p.upcoming })}
            title={p.name}
            alt={p.name}
            keyboard
            zIndexOffset={p.id === selectedId ? 1000 : p.upcoming ? -100 : 0}
            eventHandlers={{ click: () => onSelect(p.id) }}
          />
        </Fragment>
      ))}
    </MapContainer>
  );
}
