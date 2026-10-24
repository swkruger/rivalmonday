const WHOLE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * US dollars. `unit` says what `amount` is: whole dollars ('usd', default) or integer cents ('cents'). Cents are shown by
 * default only when the amount has a fractional part or is under $1 ("$229", "$0.42"); pass `cents` to force either way.
 */
export function formatMoney(amount: number, o: { unit?: 'usd' | 'cents'; cents?: boolean } = {}): string {
  const usd = o.unit === 'cents' ? amount / 100 : amount;
  const showCents = o.cents ?? (Math.abs(usd) < 1 || Math.round(usd * 100) % 100 !== 0);
  return (showCents ? CENTS : WHOLE).format(usd);
}

const CREDITS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** Tenant-facing usage in whole credits: "1,234 credits" (never dollars; the platform alone sees USD). */
export function formatCredits(n: number): string {
  return `${CREDITS.format(n)} credits`;
}

/** "1,250 of 1,500 credits": used against the limit. */
export function formatCreditsOf(used: number, limit: number): string {
  return `${CREDITS.format(used)} of ${formatCredits(limit)}`;
}
