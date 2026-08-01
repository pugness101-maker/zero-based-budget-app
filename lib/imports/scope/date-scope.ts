import {
  endOfMonth,
  endOfYear,
  startOfMonth,
  startOfYear,
  subMonths,
  subYears,
} from "date-fns";
import { formatDisplayDate, toISODate, toMonthKey } from "@/lib/dates";
import type { MonthKey } from "@/lib/dates";
import { isDateInRange } from "@/lib/transactions/date-range";
import type { ImportDatePresetId, ImportDateRange } from "@/lib/imports/scope/types";

/** Resolve import date presets to inclusive calendar dates (local timezone). */
export function resolveImportDatePreset(
  preset: ImportDatePresetId,
  options: {
    now?: Date;
    customStart?: string | null;
    customEnd?: string | null;
  } = {},
): ImportDateRange {
  const now = options.now ?? new Date();

  if (preset === "all_dates") {
    return { preset, startDate: null, endDate: null };
  }
  if (preset === "custom") {
    return {
      preset,
      startDate: options.customStart ?? null,
      endDate: options.customEnd ?? null,
    };
  }
  if (preset === "year_2026") {
    return { preset, startDate: "2026-01-01", endDate: "2026-12-31" };
  }
  if (preset === "this_year") {
    return {
      preset,
      startDate: toISODate(startOfYear(now)),
      endDate: toISODate(endOfYear(now)),
    };
  }
  if (preset === "last_year") {
    const last = subYears(now, 1);
    return {
      preset,
      startDate: toISODate(startOfYear(last)),
      endDate: toISODate(endOfYear(last)),
    };
  }
  if (preset === "this_month") {
    return {
      preset,
      startDate: toISODate(startOfMonth(now)),
      endDate: toISODate(endOfMonth(now)),
    };
  }
  if (preset === "last_month") {
    const last = subMonths(now, 1);
    return {
      preset,
      startDate: toISODate(startOfMonth(last)),
      endDate: toISODate(endOfMonth(last)),
    };
  }
  return { preset: "all_dates", startDate: null, endDate: null };
}

/**
 * Inclusive full-day filter on YYYY-MM-DD transaction dates.
 * Start day from 12:00 AM; end day through 11:59:59 PM (date-only compare).
 */
export function isRegisterDateInScope(
  isoDate: string | null | undefined,
  range: Pick<ImportDateRange, "startDate" | "endDate">,
): boolean {
  if (!isoDate) return false;
  return isDateInRange(isoDate, range);
}

/**
 * Plan month overlaps the selected date range when any day of that month
 * falls inside [startDate, endDate]. Example: Jan 15–Mar 10 includes Jan, Feb, Mar.
 */
export function doesPlanMonthOverlapRange(
  monthKey: MonthKey | string | null | undefined,
  range: Pick<ImportDateRange, "startDate" | "endDate">,
): boolean {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return false;
  if (!range.startDate && !range.endDate) return true;

  const monthStart = `${monthKey}-01`;
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  const monthEnd = toISODate(endOfMonth(new Date(y, m - 1, 1)));

  if (range.startDate && monthEnd < range.startDate) return false;
  if (range.endDate && monthStart > range.endDate) return false;
  return true;
}

export function formatImportDateRangeLabel(range: ImportDateRange): string {
  if (range.preset === "all_dates" || (!range.startDate && !range.endDate)) {
    return "All dates";
  }
  if (range.preset === "year_2026") return "2026 only";
  if (range.preset !== "custom") {
    const labels: Record<string, string> = {
      this_year: "This year",
      last_year: "Last year",
      this_month: "This month",
      last_month: "Last month",
    };
    if (labels[range.preset]) return labels[range.preset]!;
  }
  if (range.startDate && range.endDate) {
    return `${formatDisplayDate(range.startDate)} – ${formatDisplayDate(range.endDate)}`;
  }
  if (range.startDate) return `From ${formatDisplayDate(range.startDate)}`;
  if (range.endDate) return `Through ${formatDisplayDate(range.endDate)}`;
  return "Custom range";
}

export function monthKeysOverlappingRange(
  range: Pick<ImportDateRange, "startDate" | "endDate">,
): MonthKey[] | null {
  if (!range.startDate && !range.endDate) return null;
  const start = range.startDate ?? "1970-01-01";
  const end = range.endDate ?? "9999-12-31";
  const keys: MonthKey[] = [];
  let cursor = toMonthKey(new Date(`${start.slice(0, 7)}-01T12:00:00`));
  const endMonth = end.slice(0, 7);
  while (cursor <= endMonth) {
    keys.push(cursor);
    const [y, m] = cursor.split("-").map(Number) as [number, number];
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    cursor = next as MonthKey;
    if (keys.length > 600) break;
  }
  return keys;
}
