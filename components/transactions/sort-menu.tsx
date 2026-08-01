"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpDown, Check, X } from "lucide-react";
import {
  SORT_PRESET_OPTIONS,
  criteriaEqual,
  describeSortCriteria,
  type SortCriterion,
  type TransactionSortPreset,
} from "@/lib/transactions/sort";
import { cn } from "@/lib/utils";

export function SortMenu({
  criteria,
  onSelectPreset,
  onClear,
  onResetDefault,
  allowedPresets,
  className,
}: {
  criteria: SortCriterion[];
  onSelectPreset: (preset: TransactionSortPreset) => void;
  onClear: () => void;
  onResetDefault: () => void;
  /** Limit presets (e.g. hide Account sorts on register). */
  allowedPresets?: TransactionSortPreset[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const options = SORT_PRESET_OPTIONS.filter(
    (o) => !allowedPresets || allowedPresets.includes(o.id),
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const label = describeSortCriteria(criteria);

  return (
    <div className={cn("relative", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-black/5"
        >
          <ArrowUpDown className="h-4 w-4" aria-hidden />
          Sort
        </button>
        <p className="text-xs text-muted md:hidden" aria-live="polite">
          {label}
        </p>
        <p className="hidden text-xs text-muted md:block" aria-live="polite">
          Sorted by {label}
        </p>
      </div>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close sort menu"
            className="fixed inset-0 z-40 bg-black/40 md:bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            role="dialog"
            aria-label="Sort transactions"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] overflow-y-auto rounded-t-2xl border border-border bg-surface p-4 shadow-xl md:absolute md:inset-auto md:top-full md:right-0 md:mt-2 md:w-72 md:max-h-[min(70vh,28rem)] md:rounded-xl"
          >
            <div className="mb-3 flex items-center justify-between md:hidden">
              <h2 className="text-base font-semibold">Sort</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 hover:bg-black/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <ul className="space-y-1">
              {options.map((opt) => {
                const active = criteriaEqual(criteria, opt.criteria);
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectPreset(opt.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full min-h-11 items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-black/5",
                        active && "bg-accent-muted text-accent",
                      )}
                    >
                      <span>{opt.label}</span>
                      {active && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-black/5"
              >
                Clear sorting
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetDefault();
                  setOpen(false);
                }}
                className="min-h-11 rounded-lg px-3 py-2 text-sm text-muted hover:bg-black/5"
              >
                Reset to default
              </button>
              <p className="hidden text-[11px] text-muted md:block">
                Tip: Shift+click column headers for multi-column sorting.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
