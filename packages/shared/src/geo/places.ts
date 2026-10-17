import { normalizeText } from '../search/normalize';
import type { LatLng } from './round';

/**
 * Built-in list of LA-area places for people who don't share their location.
 * Matching happens on the device, so what someone types here never leaves it.
 * Coordinates are rough neighborhood centers.
 */
export interface Place extends LatLng {
  name: string;
  aliases?: string[];
}

export const LA_PLACES: Place[] = [
  { name: 'Downtown LA', aliases: ['DTLA', 'Centro', 'Downtown Los Angeles'], lat: 34.0453, lng: -118.2509 },
  { name: 'Fashion District', aliases: ['Santee Alley'], lat: 34.0369, lng: -118.2512 },
  { name: 'Flower District', lat: 34.0412, lng: -118.2493 },
  { name: 'Olvera Street', aliases: ['El Pueblo', 'Placita Olvera'], lat: 34.0574, lng: -118.2377 },
  { name: 'Chinatown', lat: 34.0623, lng: -118.2383 },
  { name: 'Little Tokyo', lat: 34.0501, lng: -118.2400 },
  { name: 'Arts District', lat: 34.0400, lng: -118.2330 },
  { name: 'Boyle Heights', lat: 34.0339, lng: -118.2051 },
  { name: 'Mariachi Plaza', lat: 34.0472, lng: -118.2196 },
  { name: 'East Los Angeles', aliases: ['East LA', 'ELA', 'Este de Los Ángeles'], lat: 34.0239, lng: -118.1720 },
  { name: 'Lincoln Heights', lat: 34.0689, lng: -118.2110 },
  { name: 'El Sereno', lat: 34.0817, lng: -118.1798 },
  { name: 'Highland Park', lat: 34.1137, lng: -118.1924 },
  { name: 'Eagle Rock', lat: 34.1394, lng: -118.2124 },
  { name: 'Cypress Park', lat: 34.0864, lng: -118.2246 },
  { name: 'Echo Park', lat: 34.0782, lng: -118.2606 },
  { name: 'Silver Lake', aliases: ['Silverlake'], lat: 34.0869, lng: -118.2702 },
  { name: 'Los Feliz', lat: 34.1063, lng: -118.2848 },
  { name: 'East Hollywood', lat: 34.0907, lng: -118.2950 },
  { name: 'Hollywood', lat: 34.0980, lng: -118.3270 },
  { name: 'West Hollywood', aliases: ['WeHo'], lat: 34.0900, lng: -118.3617 },
  { name: 'Koreatown', aliases: ['K-Town', 'Ktown'], lat: 34.0618, lng: -118.3004 },
  { name: 'Westlake', aliases: ['MacArthur Park'], lat: 34.0577, lng: -118.2780 },
  { name: 'Pico-Union', lat: 34.0478, lng: -118.2899 },
  { name: 'Mid-City', lat: 34.0430, lng: -118.3480 },
  { name: 'Mid-Wilshire', lat: 34.0617, lng: -118.3350 },
  { name: 'University Park', aliases: ['USC', 'Exposition Park'], lat: 34.0224, lng: -118.2851 },
  { name: 'South Los Angeles', aliases: ['South LA', 'South Central', 'Sur de Los Ángeles'], lat: 33.9894, lng: -118.2913 },
  { name: 'Watts', lat: 33.9416, lng: -118.2434 },
  { name: 'Florence', aliases: ['Florence-Firestone'], lat: 33.9729, lng: -118.2470 },
  { name: 'Leimert Park', lat: 34.0049, lng: -118.3318 },
  { name: 'Crenshaw', lat: 34.0130, lng: -118.3350 },
  { name: 'Baldwin Hills', lat: 34.0093, lng: -118.3614 },
  { name: 'Culver City', lat: 34.0211, lng: -118.3965 },
  { name: 'Palms', lat: 34.0236, lng: -118.4103 },
  { name: 'Westwood', aliases: ['UCLA'], lat: 34.0635, lng: -118.4455 },
  { name: 'Santa Monica', lat: 34.0195, lng: -118.4912 },
  { name: 'Venice', aliases: ['Venice Beach'], lat: 33.9850, lng: -118.4695 },
  { name: 'Mar Vista', lat: 34.0021, lng: -118.4334 },
  { name: 'Inglewood', lat: 33.9617, lng: -118.3531 },
  { name: 'Hawthorne', lat: 33.9164, lng: -118.3526 },
  { name: 'Lennox', lat: 33.9381, lng: -118.3526 },
  { name: 'Huntington Park', lat: 33.9817, lng: -118.2251 },
  { name: 'Maywood', lat: 33.9867, lng: -118.1854 },
  { name: 'Bell', lat: 33.9775, lng: -118.1870 },
  { name: 'Cudahy', lat: 33.9606, lng: -118.1854 },
  { name: 'South Gate', lat: 33.9547, lng: -118.2120 },
  { name: 'Lynwood', lat: 33.9303, lng: -118.2115 },
  { name: 'Compton', lat: 33.8958, lng: -118.2201 },
  { name: 'Commerce', lat: 34.0006, lng: -118.1598 },
  { name: 'Montebello', lat: 34.0165, lng: -118.1138 },
  { name: 'Pico Rivera', lat: 33.9831, lng: -118.0967 },
  { name: 'Whittier', lat: 33.9792, lng: -118.0328 },
  { name: 'Downey', lat: 33.9401, lng: -118.1332 },
  { name: 'Alhambra', lat: 34.0953, lng: -118.1270 },
  { name: 'Pasadena', lat: 34.1478, lng: -118.1445 },
  { name: 'Glendale', lat: 34.1425, lng: -118.2551 },
  { name: 'Burbank', lat: 34.1808, lng: -118.3090 },
  { name: 'North Hollywood', aliases: ['NoHo'], lat: 34.1870, lng: -118.3813 },
  { name: 'Van Nuys', lat: 34.1866, lng: -118.4487 },
  { name: 'Panorama City', lat: 34.2244, lng: -118.4490 },
  { name: 'Pacoima', lat: 34.2627, lng: -118.4270 },
  { name: 'San Fernando', lat: 34.2819, lng: -118.4390 },
  { name: 'Sylmar', lat: 34.3078, lng: -118.4492 },
  { name: 'Reseda', lat: 34.2011, lng: -118.5365 },
  { name: 'Canoga Park', lat: 34.2011, lng: -118.5981 },
  { name: 'Wilmington', lat: 33.7802, lng: -118.2626 },
  { name: 'San Pedro', lat: 33.7361, lng: -118.2923 },
  { name: 'Long Beach', lat: 33.7701, lng: -118.1937 },
  { name: 'El Monte', lat: 34.0686, lng: -118.0276 },
  { name: 'Baldwin Park', lat: 34.0853, lng: -117.9609 },
];

export const DEFAULT_PLACE: Place = LA_PLACES[0]!;

/** Case/accent-insensitive prefix-or-substring search over names and aliases. */
export function searchPlaces(query: string, limit = 8): Place[] {
  const q = normalizeText(query);
  if (!q) return LA_PLACES.slice(0, limit);
  const scored: Array<{ place: Place; score: number }> = [];
  for (const place of LA_PLACES) {
    const names = [place.name, ...(place.aliases ?? [])].map(normalizeText);
    let best = 0;
    for (const n of names) {
      if (n === q) best = Math.max(best, 3);
      else if (n.startsWith(q)) best = Math.max(best, 2);
      else if (n.includes(q)) best = Math.max(best, 1);
    }
    if (best > 0) scored.push({ place, score: best });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name))
    .slice(0, limit)
    .map((s) => s.place);
}
