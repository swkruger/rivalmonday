/** "1,234" (en-US grouping); whole numbers show no decimals, fractional ones up to 2. */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });
}
