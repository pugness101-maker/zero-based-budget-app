import {
  addDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { formatDisplayDate, toISODate } from "@/lib/dates";

export type DateRangePresetId =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "all_time"
  | "custom";

export interface DateRangeSelection {
  preset: DateRangePresetId;
  /** Inclusive YYYY-MM-DD; null when All Time */
  startDate: string | null;
  endDate: string | null;
}

export const DATE_RANGE_PRESETS: Array<{
  id: DateRangePresetId;
  label: string;
}> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7_days", label: "Last 7 Days" },
  { id: "last_30_days", label: "Last 30 Days" },
  { id: "this_week", label: "This Week" },
  { id: "last_week", label: "Last Week" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "this_year", label: "This Year" },
  { id: "last_year", label: "Last Year" },
  { id: "all_time", label: "All Time" },
  { id: "custom", label: "Custom Range" },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

export function presetLabel(preset: DateRangePresetId): string {
  return DATE_RANGE_PRESETS.find((p) => p.id === preset)?.label ?? "Custom Range";
}

/** Resolve a preset to inclusive calendar dates in the user's local timezone. */
export function resolveDateRangePreset(
  preset: DateRangePresetId,
  options: {
    now?: Date;
    weekStartsOn?: 0 | 1;
    customStart?: string;
    customEnd?: string;
  } = {},
): DateRangeSelection {
  const now = options.now ?? new Date();
  const weekStartsOn = options.weekStartsOn ?? 0;

  if (preset === "all_time") {
    return { preset, startDate: null, endDate: null };
  }
  if (preset === "custom") {
    return {
      preset,
      startDate: options.customStart ?? null,
      endDate: options.customEnd ?? null,
    };
  }

  const today = toISODate(now);

  switch (preset) {
    case "today":
      return { preset, startDate: today, endDate: today };
    case "yesterday": {
      const y = toISODate(subDays(now, 1));
      return { preset, startDate: y, endDate: y };
    }
    case "last_7_days":
      return {
        preset,
        startDate: toISODate(subDays(now, 6)),
        endDate: today,
      };
    case "last_30_days":
      return {
        preset,
        startDate: toISODate(subDays(now, 29)),
        endDate: today,
      };
    case "this_week":
      return {
        preset,
        startDate: toISODate(startOfWeek(now, { weekStartsOn })),
        endDate: toISODate(endOfWeek(now, { weekStartsOn })),
      };
    case "last_week": {
      const prev = subWeeks(now, 1);
      return {
        preset,
        startDate: toISODate(startOfWeek(prev, { weekStartsOn })),
        endDate: toISODate(endOfWeek(prev, { weekStartsOn })),
      };
    }
    case "this_month":
      return {
        preset,
        startDate: toISODate(startOfMonth(now)),
        endDate: toISODate(endOfMonth(now)),
      };
    case "last_month": {
      const prev = subMonths(now, 1);
      return {
        preset,
        startDate: toISODate(startOfMonth(prev)),
        endDate: toISODate(endOfMonth(prev)),
      };
    }
    case "this_year":
      return {
        preset,
        startDate: toISODate(startOfYear(now)),
        endDate: toISODate(endOfYear(now)),
      };
    case "last_year": {
      const prev = subYears(now, 1);
      return {
        preset,
        startDate: toISODate(startOfYear(prev)),
        endDate: toISODate(endOfYear(prev)),
      };
    }
    default:
      return { preset: "all_time", startDate: null, endDate: null };
  }
}

export function validateCustomRange(
  startDate: string,
  endDate: string,
): { ok: true } | { ok: false; error: string } {
  if (!startDate || !isIsoDate(startDate)) {
    return { ok: false, error: "Start date is required." };
  }
  if (!endDate || !isIsoDate(endDate)) {
    return { ok: false, error: "End date is required." };
  }
  if (startDate > endDate) {
    return { ok: false, error: "Start date cannot be after end date." };
  }
  return { ok: true };
}

/**
 * Inclusive calendar-day filter on transaction posted/scheduled date (YYYY-MM-DD).
 * Start day is included from the beginning of that calendar day; end day through
 * the end of that calendar day (string compare is equivalent for date-only storage).
 */
export function isDateInRange(
  isoDate: string,
  range: Pick<DateRangeSelection, "startDate" | "endDate">,
): boolean {
  if (!range.startDate && !range.endDate) return true;
  const day = isoDate.slice(0, 10);
  if (range.startDate && day < range.startDate) return false;
  if (range.endDate && day > range.endDate) return false;
  return true;
}

export function isDateRangeActive(
  range: Pick<DateRangeSelection, "startDate" | "endDate" | "preset">,
): boolean {
  return (
    range.preset !== "all_time" &&
    (Boolean(range.startDate) || Boolean(range.endDate))
  );
}

export function formatDateRangeChip(range: DateRangeSelection): string {
  if (range.preset === "all_time" || !isDateRangeActive(range)) {
    return "All Time";
  }
  if (range.preset !== "custom") {
    return presetLabel(range.preset);
  }
  if (range.startDate && range.endDate) {
    if (range.startDate === range.endDate) {
      return formatDisplayDate(range.startDate);
    }
    return `${formatDisplayDate(range.startDate)} – ${formatDisplayDate(range.endDate)}`;
  }
  if (range.startDate) return `From ${formatDisplayDate(range.startDate)}`;
  if (range.endDate) return `Through ${formatDisplayDate(range.endDate)}`;
  return "Custom Range";
}

const PRESET_IDS = new Set<string>(DATE_RANGE_PRESETS.map((p) => p.id));

export function parseDateRangeFromSearchParams(
  params: URLSearchParams,
  options: { weekStartsOn?: 0 | 1; now?: Date } = {},
): DateRangeSelection {
  const rangeParam = params.get("range");
  const start = params.get("start");
  const end = params.get("end");

  if (rangeParam && PRESET_IDS.has(rangeParam) && rangeParam !== "custom") {
    if (rangeParam === "all_time") {
      return { preset: "all_time", startDate: null, endDate: null };
    }
    // Prefer stored bounds when present so shared links stay stable
    if (start && end && isIsoDate(start) && isIsoDate(end) && start <= end) {
      return {
        preset: rangeParam as DateRangePresetId,
        startDate: start,
        endDate: end,
      };
    }
    return resolveDateRangePreset(rangeParam as DateRangePresetId, options);
  }

  if (
    (rangeParam === "custom" || start || end) &&
    start &&
    end &&
    isIsoDate(start) &&
    isIsoDate(end) &&
    start <= end
  ) {
    return { preset: "custom", startDate: start, endDate: end };
  }

  return { preset: "all_time", startDate: null, endDate: null };
}

/** Merge date-range params into an existing query string (preserves other keys). */
export function applyDateRangeToSearchParams(
  params: URLSearchParams,
  range: DateRangeSelection,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  if (!isDateRangeActive(range)) {
    next.delete("range");
    next.delete("start");
    next.delete("end");
    return next;
  }
  next.set("range", range.preset);
  if (range.startDate) next.set("start", range.startDate);
  else next.delete("start");
  if (range.endDate) next.set("end", range.endDate);
  else next.delete("end");
  return next;
}

export function filterTransactionsByDateRange<T extends { date: string }>(
  transactions: T[],
  range: Pick<DateRangeSelection, "startDate" | "endDate">,
): T[] {
  if (!range.startDate && !range.endDate) return transactions;
  return transactions.filter((t) => isDateInRange(t.date, range));
}

/** Local calendar helper exposed for tests */
export function formatLocalYmd(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return toISODate(addDays(new Date(y!, m! - 1, d!), days));
}
