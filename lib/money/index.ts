/** All monetary values are integer cents. */

export type Cents = number;

export function dollarsToCents(dollars: number): Cents {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: Cents): number {
  return cents / 100;
}

export function formatMoney(
  cents: Cents,
  options: {
    currency?: string;
    hideBalances?: boolean;
    signed?: boolean;
    showPlus?: boolean;
  } = {},
): string {
  const {
    currency = "USD",
    hideBalances = false,
    signed = false,
    showPlus = false,
  } = options;

  if (hideBalances) return "••••";

  const abs = Math.abs(cents);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(centsToDollars(abs));

  if (signed || cents < 0) {
    if (cents < 0) return `−${formatted}`;
    if (showPlus && cents > 0) return `+${formatted}`;
  }

  return cents < 0 ? `−${formatted}` : formatted;
}

export function parseMoneyInput(value: string): Cents | null {
  const cleaned = value.replace(/[$,\s]/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return dollarsToCents(num);
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
