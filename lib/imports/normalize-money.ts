import type { Cents } from "@/lib/money";

/**
 * Parse currency strings into integer cents without intermediate floats
 * beyond a final rounded conversion of a decimal string.
 *
 * Supports: $, commas, parentheses negatives, trailing/leading minus, CR/DR.
 */
export function normalizeMoneyToCents(raw: string | null | undefined): Cents | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  const lower = s.toLowerCase();
  if (lower.endsWith("cr")) {
    s = s.slice(0, -2).trim();
  } else if (lower.endsWith("dr")) {
    negative = true;
    s = s.slice(0, -2).trim();
  }

  s = s.replace(/[$€£¥]/g, "").replace(/,/g, "").replace(/\s/g, "");
  if (!s) return null;

  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  if (!/^\d+(\.\d{1,2})?$/.test(s) && !/^\d+\.$/.test(s)) {
    // Allow more decimal places then round
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
  }

  const [wholePart, fracPart = ""] = s.split(".");
  const whole = Number(wholePart);
  if (!Number.isFinite(whole)) return null;

  const fracPadded = (fracPart + "00").slice(0, 2);
  const fracExtra = fracPart.slice(2);
  let cents = whole * 100 + Number(fracPadded);
  if (fracExtra) {
    // Round from next digit
    const next = Number(fracExtra[0] ?? "0");
    if (next >= 5) cents += 1;
  }

  return negative ? -cents : cents;
}

/** Combine separate outflow/inflow columns into a signed amount (inflow positive). */
export function combineOutflowInflow(
  outflowRaw: string | null | undefined,
  inflowRaw: string | null | undefined,
): Cents | null {
  const outflow = normalizeMoneyToCents(outflowRaw);
  const inflow = normalizeMoneyToCents(inflowRaw);

  const hasOut =
    outflowRaw != null && String(outflowRaw).trim() !== "" && outflow !== null;
  const hasIn =
    inflowRaw != null && String(inflowRaw).trim() !== "" && inflow !== null;

  if (!hasOut && !hasIn) return null;
  if (hasOut && hasIn && outflow !== 0 && inflow !== 0) {
    // Prefer net if both present
    return Math.abs(inflow!) - Math.abs(outflow!);
  }
  if (hasOut) return -Math.abs(outflow!);
  return Math.abs(inflow!);
}
