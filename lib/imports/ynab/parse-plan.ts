import { parseCsv } from "@/lib/imports/parse-csv";
import { normalizeMoneyToCents } from "@/lib/imports/normalize-money";
import type { MonthKey } from "@/lib/dates";

export interface YnabPlanRow {
  rowIndex: number;
  raw: Record<string, string>;
  monthKey: MonthKey | null;
  monthLabel: string;
  categoryGroupCategory?: string;
  categoryGroup?: string;
  category?: string;
  assignedCents: number | null;
  activityCents: number | null;
  availableCents: number | null;
  errors: string[];
}

const MONTH_NAMES: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** Parse values like "May 2025", "May 2025 ", "2025-05". */
export function parseYnabMonth(raw: string): MonthKey | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}$/.test(s)) return s;

  const m = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const monthNum = MONTH_NAMES[m[1]!.toLowerCase()];
  if (!monthNum) return null;
  return `${m[2]}-${String(monthNum).padStart(2, "0")}`;
}

export function isYnabPlanCsv(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim()));
  return (
    set.has("Month") &&
    set.has("Assigned") &&
    (set.has("Category") || set.has("Category Group/Category"))
  );
}

export function parseYnabPlanCsv(content: string): {
  headers: string[];
  rows: YnabPlanRow[];
  headerOk: boolean;
} {
  const parsed = parseCsv(content);
  const headerOk = isYnabPlanCsv(parsed.headers);
  const rows: YnabPlanRow[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const raw = parsed.rows[i]!;
    const errors: string[] = [];
    const monthLabel = (raw.Month ?? "").trim();
    const monthKey = parseYnabMonth(monthLabel);
    if (!monthKey) errors.push("Invalid month.");

    const assignedCents = normalizeMoneyToCents(raw.Assigned ?? "");
    const activityCents = normalizeMoneyToCents(raw.Activity ?? "");
    const availableCents = normalizeMoneyToCents(raw.Available ?? "");

    // Allow negative assigned/available; null only if unparsable non-empty
    if ((raw.Assigned ?? "").trim() && assignedCents === null) {
      errors.push("Invalid Assigned amount.");
    }

    rows.push({
      rowIndex: i + 1,
      raw,
      monthKey,
      monthLabel,
      categoryGroupCategory:
        (raw["Category Group/Category"] ?? "").trim() || undefined,
      categoryGroup: (raw["Category Group"] ?? "").trim() || undefined,
      category: (raw.Category ?? "").trim() || undefined,
      assignedCents,
      activityCents,
      availableCents,
      errors,
    });
  }

  return { headers: parsed.headers, rows, headerOk };
}
