import { describe, expect, it } from "vitest";
import {
  applyDateRangeToSearchParams,
  filterTransactionsByDateRange,
  formatDateRangeChip,
  isDateInRange,
  parseDateRangeFromSearchParams,
  resolveDateRangePreset,
  validateCustomRange,
} from "@/lib/transactions/date-range";

describe("resolveDateRangePreset", () => {
  const now = new Date(2026, 7, 15, 14, 30, 0); // Aug 15, 2026 local

  it("defaults all time to null bounds", () => {
    expect(resolveDateRangePreset("all_time")).toEqual({
      preset: "all_time",
      startDate: null,
      endDate: null,
    });
  });

  it("resolves today / yesterday / last 7 / last 30", () => {
    expect(resolveDateRangePreset("today", { now })).toMatchObject({
      startDate: "2026-08-15",
      endDate: "2026-08-15",
    });
    expect(resolveDateRangePreset("yesterday", { now })).toMatchObject({
      startDate: "2026-08-14",
      endDate: "2026-08-14",
    });
    expect(resolveDateRangePreset("last_7_days", { now })).toMatchObject({
      startDate: "2026-08-09",
      endDate: "2026-08-15",
    });
    expect(resolveDateRangePreset("last_30_days", { now })).toMatchObject({
      startDate: "2026-07-17",
      endDate: "2026-08-15",
    });
  });

  it("resolves this month and last month", () => {
    expect(resolveDateRangePreset("this_month", { now })).toMatchObject({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(resolveDateRangePreset("last_month", { now })).toMatchObject({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
  });

  it("resolves this year and last year", () => {
    expect(resolveDateRangePreset("this_year", { now })).toMatchObject({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    expect(resolveDateRangePreset("last_year", { now })).toMatchObject({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });
  });

  it("respects weekStartsOn for this week", () => {
    // Aug 15 2026 is Saturday
    const sun = resolveDateRangePreset("this_week", {
      now,
      weekStartsOn: 0,
    });
    expect(sun.startDate).toBe("2026-08-09");
    expect(sun.endDate).toBe("2026-08-15");

    const mon = resolveDateRangePreset("this_week", {
      now,
      weekStartsOn: 1,
    });
    expect(mon.startDate).toBe("2026-08-10");
    expect(mon.endDate).toBe("2026-08-16");
  });
});

describe("validateCustomRange", () => {
  it("requires both dates and order", () => {
    expect(validateCustomRange("", "2026-08-01").ok).toBe(false);
    expect(validateCustomRange("2026-08-01", "").ok).toBe(false);
    expect(validateCustomRange("2026-08-10", "2026-08-01").ok).toBe(false);
    expect(validateCustomRange("2026-08-01", "2026-08-10").ok).toBe(true);
  });
});

describe("isDateInRange", () => {
  it("includes full start and end calendar days", () => {
    const range = { startDate: "2026-08-01", endDate: "2026-08-31" };
    expect(isDateInRange("2026-08-01", range)).toBe(true);
    expect(isDateInRange("2026-08-31", range)).toBe(true);
    expect(isDateInRange("2026-07-31", range)).toBe(false);
    expect(isDateInRange("2026-09-01", range)).toBe(false);
  });

  it("treats all-time as inclusive of everything", () => {
    expect(
      isDateInRange("1999-01-01", { startDate: null, endDate: null }),
    ).toBe(true);
  });
});

describe("filter + chip + URL", () => {
  it("filters before consumer sort by date", () => {
    const txns = [
      { id: "a", date: "2026-07-01" },
      { id: "b", date: "2026-08-15" },
      { id: "c", date: "2026-09-01" },
    ];
    const filtered = filterTransactionsByDateRange(txns, {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(filtered.map((t) => t.id)).toEqual(["b"]);
  });

  it("formats chip for presets and custom", () => {
    expect(
      formatDateRangeChip({
        preset: "last_30_days",
        startDate: "2026-07-17",
        endDate: "2026-08-15",
      }),
    ).toBe("Last 30 Days");
    expect(
      formatDateRangeChip({
        preset: "custom",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      }),
    ).toBe("Aug 1, 2026 – Aug 31, 2026");
  });

  it("parses and writes URL query params", () => {
    const parsed = parseDateRangeFromSearchParams(
      new URLSearchParams("range=custom&start=2026-08-01&end=2026-08-31"),
    );
    expect(parsed).toEqual({
      preset: "custom",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });

    const params = applyDateRangeToSearchParams(
      new URLSearchParams("batch=abc"),
      parsed,
    );
    expect(params.get("batch")).toBe("abc");
    expect(params.get("start")).toBe("2026-08-01");
    expect(params.get("end")).toBe("2026-08-31");
    expect(params.get("range")).toBe("custom");

    const cleared = applyDateRangeToSearchParams(params, {
      preset: "all_time",
      startDate: null,
      endDate: null,
    });
    expect(cleared.get("start")).toBeNull();
    expect(cleared.get("end")).toBeNull();
    expect(cleared.get("batch")).toBe("abc");
  });

  it("parses start/end without range as custom", () => {
    const parsed = parseDateRangeFromSearchParams(
      new URLSearchParams("start=2026-08-01&end=2026-08-31"),
    );
    expect(parsed.preset).toBe("custom");
  });
});
