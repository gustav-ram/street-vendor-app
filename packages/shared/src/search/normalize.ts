/**
 * Normalizes free text for matching: lowercase, strip accents, drop periods
 * and apostrophes ("L.A." -> "la"), turn other punctuation into spaces,
 * collapse whitespace. "Élote, ¡ASADO!" -> "elote asado".
 * The same function builds synonym phrases (seed) and parses queries (API).
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    // Recompose what NFD split apart that wasn't an accent (e.g. Hangul syllables).
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
