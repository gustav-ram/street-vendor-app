"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { PublicPoint } from "@streeteats/shared";

// Same approximate-area circle customers see on the main map.
const APPROX_RADIUS_M = 150;

function Recenter({ point }: { point: PublicPoint }) {
  const map = useMap();
  useEffect(() => {
    map.setView([point.lat, point.lng], map.getZoom(), { animate: false });
  }, [map, point.lat, point.lng]);
  return null;
}

/** Exactly what customers see: the public point (fuzzed in approximate mode), not the device's position. */
export default function LiveMap({ point, emoji, label }: { point: PublicPoint; emoji: string; label: string }) {
  const icon = L.divIcon({
    className: "se-pin-wrap",
    html: `<div class="se-pin">${emoji}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
  return (
    <MapContainer
      center={[point.lat, point.lng]}
      zoom={15}
      className="h-56 w-full rounded-2xl"
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      boxZoom={false}
      keyboard={false}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Recenter point={point} />
      {point.precision === "approximate" && (
        <Circle center={[point.lat, point.lng]} radius={APPROX_RADIUS_M} pathOptions={{ color: "#b42318", weight: 1, fillOpacity: 0.1 }} />
      )}
      <Marker position={[point.lat, point.lng]} icon={icon} title={label} alt={label} interactive={false} keyboard={false} />
    </MapContainer>
  );
}
