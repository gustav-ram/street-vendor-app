/**
 * Normalizes free text for matching: lowercase, strip accents, turn
 * punctuation into spaces, collapse whitespace. "Élote, ¡ASADO!" -> "elote asado".
 * The same function builds synonym phrases (seed) and parses queries (API).
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
