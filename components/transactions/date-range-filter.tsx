"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarRange, X } from "lucide-react";
import {
  DATE_RANGE_PRESETS,
  formatDateRangeChip,
  isDateRangeActive,
  resolveDateRangePreset,
  validateCustomRange,
  type DateRangePresetId,
  type DateRangeSelection,
} from "@/lib/transactions/date-range";
import { cn } from "@/lib/utils";

export function DateRangeFilter({
  value,
  onChange,
  weekStartsOn = 0,
  matchCount,
  className,
}: {
  value: DateRangeSelection;
  onChange: (next: DateRangeSelection) => void;
  weekStartsOn?: 0 | 1;
  matchCount?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(value.startDate ?? "");
  const [draftEnd, setDraftEnd] = useState(value.endDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setCustomOpen(false);
        setError(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function selectPreset(id: DateRangePresetId) {
    if (id === "custom") {
      setCustomOpen(true);
      setDraftStart(value.startDate ?? "");
      setDraftEnd(value.endDate ?? "");
      setError(null);
      return;
    }
    onChange(resolveDateRangePreset(id, { weekStartsOn }));
    setOpen(false);
    setCustomOpen(false);
    setError(null);
  }

  function applyCustom() {
    const check = validateCustomRange(draftStart, draftEnd);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    onChange({
      preset: "custom",
      startDate: draftStart,
      endDate: draftEnd,
    });
    setOpen(false);
    setCustomOpen(false);
    setError(null);
  }

  function clearRange() {
    onChange({ preset: "all_time", startDate: null, endDate: null });
    setDraftStart("");
    setDraftEnd("");
    setCustomOpen(false);
    setOpen(false);
    setError(null);
  }

  const active = isDateRangeActive(value);
  const chip = formatDateRangeChip(value);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => {
            setOpen((v) => !v);
            setCustomOpen(false);
            setError(null);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium",
            active
              ? "border-accent bg-accent-muted/50 text-accent"
              : "border-border hover:bg-black/5",
          )}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          Date Range
          {!active && (
            <span className="text-muted font-normal">· All Time</span>
          )}
        </button>

        {active && (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-muted/40 px-2.5 py-1 text-xs font-medium text-accent">
            {chip}
            {typeof matchCount === "number" && (
              <span className="text-muted font-normal">· {matchCount}</span>
            )}
            <button
              type="button"
              aria-label="Clear date range"
              onClick={clearRange}
              className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      {open && (
        <div
          id={menuId}
          role="listbox"
          className="absolute left-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          {!customOpen ? (
            <ul className="max-h-72 overflow-y-auto py-1 text-sm">
              {DATE_RANGE_PRESETS.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value.preset === p.id}
                    onClick={() => selectPreset(p.id)}
                    className={cn(
                      "flex w-full px-3 py-2 text-left hover:bg-black/5",
                      value.preset === p.id && "bg-accent-muted/40 font-medium",
                    )}
                  >
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-3 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Custom Range
              </p>
              <label className="block space-y-1 text-xs">
                <span className="text-muted">Start Date</span>
                <input
                  type="date"
                  value={draftStart}
                  onChange={(e) => setDraftStart(e.target.value)}
                  className="input w-full"
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="text-muted">End Date</span>
                <input
                  type="date"
                  value={draftEnd}
                  onChange={(e) => setDraftEnd(e.target.value)}
                  className="input w-full"
                />
              </label>
              {error && <p className="text-xs text-danger">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyCustom}
                  className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomOpen(false);
                    setError(null);
                  }}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={clearRange}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-black/5"
                >
                  Clear Range
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
