"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LatLng } from "@streeteats/shared";

/** Downtown LA, when there's no spot yet. */
const FALLBACK: LatLng = { lat: 34.0483, lng: -118.2526 };

function Follow({ onChange }: { onChange: (p: LatLng) => void }) {
  useMapEvents({
    moveend(e) {
      const c = e.target.getCenter();
      onChange({ lat: c.lat, lng: c.lng });
    },
  });
  return null;
}

function Recenter({ to }: { to: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.setView([to.lat, to.lng], Math.max(map.getZoom(), 16));
  }, [map, to]);
  return null;
}

/**
 * Pick a spot by moving the map under a fixed pin. The spot is sent only to
 * our API, which publishes an approximate area unless the vendor chose "exact".
 */
export default function SpotPicker({
  initial,
  recenter,
  onChange,
  label,
}: {
  initial: LatLng | null;
  /** Set to move the map (e.g. after "Use where I am now"). */
  recenter: LatLng | null;
  onChange: (p: LatLng) => void;
  label: string;
}) {
  const start = initial ?? FALLBACK;
  return (
    <div className="relative">
      <MapContainer center={[start.lat, start.lng]} zoom={16} className="h-64 w-full rounded-2xl" scrollWheelZoom={false} aria-label={label}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <Follow onChange={onChange} />
        <Recenter to={recenter} />
      </MapContainer>
      {/* The pin stays in the middle; the map moves under it. */}
      <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
        <span className="-mt-9 text-4xl drop-shadow" aria-hidden>
          📍
        </span>
      </div>
    </div>
  );
}
