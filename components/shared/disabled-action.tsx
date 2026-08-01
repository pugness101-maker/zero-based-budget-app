"use client";

import { cn } from "@/lib/utils";

/** Visually present control that is intentionally unfinished. */
export function DisabledAction({
  label,
  reason,
  className,
}: {
  label: string;
  reason: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled
      title={reason}
      aria-disabled="true"
      className={cn(
        "inline-flex items-center justify-center rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted opacity-60 cursor-not-allowed",
        className,
      )}
    >
      {label}
    </button>
  );
}
