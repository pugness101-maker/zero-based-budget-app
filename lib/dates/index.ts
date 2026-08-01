import { format, parseISO } from "date-fns";

/** Budget month key: YYYY-MM (calendar month, not timezone-shifted). */
export type MonthKey = string;

export function toMonthKey(date: Date | string): MonthKey {
  if (typeof date === "string") {
    // Prefer explicit calendar prefix for YYYY-MM-DD storage.
    if (/^\d{4}-\d{2}/.test(date)) return date.slice(0, 7);
    return format(parseISO(date), "yyyy-MM");
  }
  return format(date, "yyyy-MM");
}

export function monthKeyToDate(monthKey: MonthKey): Date {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year!, month! - 1, 1);
}

export function formatMonthLabel(monthKey: MonthKey): string {
  return format(monthKeyToDate(monthKey), "MMMM yyyy");
}

export function shiftMonth(monthKey: MonthKey, delta: number): MonthKey {
  const d = monthKeyToDate(monthKey);
  d.setMonth(d.getMonth() + delta);
  return format(d, "yyyy-MM");
}

export function previousMonth(monthKey: MonthKey): MonthKey {
  return shiftMonth(monthKey, -1);
}

export function nextMonth(monthKey: MonthKey): MonthKey {
  return shiftMonth(monthKey, 1);
}

export function currentMonthKey(now = new Date()): MonthKey {
  return format(now, "yyyy-MM");
}

/** Compare calendar YYYY-MM against stored YYYY-MM-DD (timezone-safe). */
export function isDateInMonth(isoDate: string, monthKey: MonthKey): boolean {
  return isoDate.slice(0, 7) === monthKey;
}

export function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return format(new Date(year!, month! - 1, day!), "MMM d, yyyy");
}

export function toISODate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}
