/** "7.50" / "7,50" / "$7" -> 750 cents, or null if it isn't a price. */
export function parsePriceToCents(input: string): number | null {
  const cleaned = input.replace(/[$\s]/g, '').replace(',', '.');
  if (!/^\d{1,4}(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function centsToInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
