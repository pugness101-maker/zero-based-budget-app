"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SortCriterion,
  SortDirection,
  TransactionSortField,
} from "@/lib/transactions/sort";
import {
  sortAriaLabel,
  sortDirectionForField,
  sortPriorityForField,
} from "@/lib/transactions/sort";

export function SortableHeader({
  field,
  label,
  criteria,
  onCycle,
  align = "left",
  className,
}: {
  field: TransactionSortField;
  label: string;
  criteria: SortCriterion[];
  onCycle: (field: TransactionSortField, shiftKey: boolean) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const direction = sortDirectionForField(criteria, field);
  const priority = sortPriorityForField(criteria, field);
  const multi = criteria.length > 1;

  return (
    <th
      className={cn(
        "sticky top-0 z-10 bg-canvas px-3 py-2.5",
        align === "right" && "text-right",
        className,
      )}
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : "none"
      }
    >
      <button
        type="button"
        onClick={(e) => onCycle(field, e.shiftKey)}
        aria-label={nextAriaLabel(field, direction)}
        title={
          multi
            ? "Shift+click to add secondary sort"
            : "Click to sort · Shift+click for multi-column"
        }
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-md px-0.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          align === "right" && "flex-row-reverse",
          direction && "text-ink",
        )}
      >
        <span className="truncate">{label}</span>
        <SortIcon direction={direction} />
        {multi && priority != null && (
          <span
            className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded bg-accent/15 px-0.5 text-[9px] font-bold text-accent"
            aria-label={`Sort priority ${priority}`}
          >
            {priority}
          </span>
        )}
      </button>
    </th>
  );
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  // Fixed-width icon slot so column widths do not shift.
  return (
    <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
      {direction === "asc" ? (
        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
      ) : direction === "desc" ? (
        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />
      )}
    </span>
  );
}

function nextAriaLabel(
  field: TransactionSortField,
  direction: SortDirection | null,
): string {
  if (direction === null) return sortAriaLabel(field, "asc");
  if (direction === "asc") return sortAriaLabel(field, "desc");
  return sortAriaLabel(field, null);
}
