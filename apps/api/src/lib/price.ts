/** $ / $$ / $$$ from the median menu price, or null for an empty menu. */
export function priceLevelFromMenu(pricesCents: number[]): 1 | 2 | 3 | null {
  if (pricesCents.length === 0) return null;
  const sorted = [...pricesCents].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  if (median < 500) return 1;
  if (median <= 1200) return 2;
  return 3;
}
