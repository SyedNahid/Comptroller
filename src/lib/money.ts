/**
 * Money helpers. All internal amounts are integer **minor units** (cents/pence)
 * to avoid floating-point drift. Currencies we use (USD, EUR, GBP, CNY, INR) all
 * have 2 minor digits.
 */

export const MINOR_DIGITS = 2;

export function toMinor(major: number): number {
  return Math.round(major * 10 ** MINOR_DIGITS);
}

export function toMajor(minor: number): number {
  return minor / 10 ** MINOR_DIGITS;
}

export function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(toMajor(minor));
  } catch {
    // Fallback if Intl doesn't know the currency code.
    return `${toMajor(minor).toFixed(MINOR_DIGITS)} ${currency}`;
  }
}
