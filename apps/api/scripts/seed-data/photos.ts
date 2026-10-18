import sharp from 'sharp';
import type { Category } from '@streeteats/shared';

// Placeholder "photos" for demo vendors: a gradient card with the item's name,
// clearly labeled as a sample. Real photos come from vendors and customers.

const COLORS: Record<Category, [string, string]> = {
  hot_dogs: ['#b42318', '#f5a524'],
  tacos: ['#157f3c', '#f5a524'],
  flowers: ['#c2185b', '#f48fb1'],
  elote: ['#c98a00', '#157f3c'],
  fruit: ['#e8590c', '#ffd43b'],
  churros: ['#7c4a1e', '#f5a524'],
  tamales: ['#6d4c41', '#bcaaa4'],
  pupusas: ['#1565c0', '#90caf9'],
  paletas: ['#7b1fa2', '#f48fb1'],
  drinks: ['#00897b', '#80deea'],
  snacks: ['#d9480f', '#ffa8a8'],
  bakery: ['#a1662f', '#ffe0b2'],
  other: ['#455a64', '#b0bec5'],
};

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';

/** A wide card (covers and food shots). */
function cardSvg(category: Category, title: string, subtitle: string) {
  const [a, b] = COLORS[category];
  const size = Math.min(96, Math.floor(1040 / (title.length * 0.56)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <circle cx="1000" cy="150" r="230" fill="#fff" fill-opacity="0.13"/>
  <circle cx="160" cy="720" r="280" fill="#000" fill-opacity="0.09"/>
  <text x="80" y="420" font-family="${FONT}" font-size="${size}" font-weight="800" fill="#fff">${escape(title)}</text>
  <text x="80" y="500" font-family="${FONT}" font-size="44" fill="#fff" fill-opacity="0.9">${escape(subtitle)}</text>
  <text x="80" y="740" font-family="${FONT}" font-size="30" fill="#fff" fill-opacity="0.75">Sample photo · Foto de muestra</text>
</svg>`;
}

/** A square badge with the business's initials (profile photos). */
function initialsSvg(category: Category, name: string) {
  const [a, b] = COLORS[category];
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
  <defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <text x="400" y="470" text-anchor="middle" font-family="${FONT}" font-size="300" font-weight="800" fill="#fff">${escape(initials || '★')}</text>
</svg>`;
}

/** PNG bytes, as if someone uploaded them (the seed sends them through the real pipeline). */
export const placeholderCard = (category: Category, title: string, subtitle: string) =>
  sharp(Buffer.from(cardSvg(category, title, subtitle))).png().toBuffer();
export const placeholderInitials = (category: Category, name: string) => sharp(Buffer.from(initialsSvg(category, name))).png().toBuffer();
